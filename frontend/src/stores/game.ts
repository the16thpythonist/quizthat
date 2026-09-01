import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  GameState,
  GameSettings,
  Player,
  PlayerColor,
  Board,
  JokerInventory,
  PlayerStats,
  Expertise,
  TurnState,
  OfferedSlot,
  QuestionData,
  JokerType,
  SessionStatus,
} from '../types/session'
import { PLAYER_COLORS, BOARD_SIZE } from '../types/session'
import { checkWin, generateSlots, assignBoostSlots, isBoostEligible, placementRuleForSlot, generateCandidates, passPlacementRule } from '../engine/algorithms'
import { GameRng } from '../engine/rng'
import { useCorpusStore } from './corpus'

function createBoard(size: number): Board {
  return {
    size,
    fields: Array.from({ length: size }, () => Array(size).fill(false)),
    peg_count: 0,
  }
}

function createJokerInventory(): JokerInventory {
  return {
    reshuffle_selection: 1,
    reshuffle_question: 1,
    reveal_hint: 1,
    the_gambler: 1,
    steal: 0,
    curse: 0,
    snipe: 0,
    double_down: 0,
  }
}

function createStats(): PlayerStats {
  return {
    questions_attempted: 0,
    questions_correct: 0,
    passes_received: 0,
    passes_correct: 0,
    jokers_used: 0,
    pegs_stolen_from: 0,
  }
}

export const useGameStore = defineStore('game', () => {
  // Core session state
  const state = ref<GameState>('setup')
  const sessionId = ref<string>('')
  const status = ref<SessionStatus>('setup')
  const players = ref<Player[]>([])
  const currentPlayerIndex = ref(0)
  const round = ref(1)
  const turn = ref<TurnState | null>(null)
  const winnerPlayerIndex = ref<number | null>(null)
  const winningLine = ref<[number, number][] | null>(null)
  const usedQuestionIds = ref<Set<string>>(new Set())
  const settings = ref<GameSettings>({
    placement_candidates: 2,
    starting_pegs: 0,
    language: 'en',
  })

  // Current question data (loaded on demand)
  const currentQuestion = ref<QuestionData | null>(null)

  // Seeded RNG for deterministic gameplay
  const rng = ref<GameRng | null>(null)

  // UI sub-state: which phase of setup we're in
  const setupPhase = ref<'start' | 'player_setup'>('start')

  // Computed
  const currentPlayer = computed<Player | null>(() =>
    players.value[currentPlayerIndex.value] ?? null,
  )

  const isCorrect = computed(() => state.value === 'answer_correct')

  // --- Setup actions ---
  function goToPlayerSetup() {
    setupPhase.value = 'player_setup'
  }

  function goToStart() {
    setupPhase.value = 'start'
  }

  function addPlayer(name: string, color: PlayerColor, expertise: Expertise) {
    const player: Player = {
      index: players.value.length,
      name: name || color.charAt(0).toUpperCase() + color.slice(1),
      color,
      expertise,
      board: createBoard(BOARD_SIZE),
      jokers: createJokerInventory(),
      stats: createStats(),
      is_cursed: false,
    }
    players.value.push(player)
  }

  function removePlayer(index: number) {
    players.value.splice(index, 1)
    players.value.forEach((p, i) => (p.index = i))
  }

  function updateSettings(newSettings: Partial<GameSettings>) {
    Object.assign(settings.value, newSettings)
  }

  function getAvailableColors(): PlayerColor[] {
    const usedColors = new Set(players.value.map((p) => p.color))
    return PLAYER_COLORS.filter((c) => !usedColors.has(c))
  }

  // --- Game transitions ---
  function startGame() {
    if (players.value.length < 2) return
    rng.value = new GameRng(Date.now())
    sessionId.value = crypto.randomUUID()
    status.value = 'in_progress'
    currentPlayerIndex.value = 0
    round.value = 1
    state.value = 'turn_start'
    // The engine will handle TURN_START -> SELECTION transition
    _initTurn()
  }

  function _initTurn() {
    const prevPlayer = _previousRoundPlayerIndex()
    turn.value = {
      active_player_index: currentPlayerIndex.value,
      previous_round_player_index: prevPlayer,
      phase: state.value,
      offered_slots: [],
      selected_slot_index: null,
      selected_question_id: null,
      boosted_slot_indices: [],
      curse_active: false,
      double_down_active: false,
      hint_revealed: false,
      jokers_used_this_turn: new Set(),
      pegs_remaining: 0,
      placement_rule: null,
      placing_player_index: currentPlayerIndex.value,
      gambler_staked_field: null,
      pass: null,
      special_joker_earned: null,
      basic_joker_earned: null,
      candidate_fields: [],
    }
  }

  function _previousRoundPlayerIndex(): number | null {
    if (round.value === 1 && currentPlayerIndex.value === 0) return null
    return (currentPlayerIndex.value - 1 + players.value.length) % players.value.length
  }

  // Transition: Player taps "continue" on TurnGateScreen
  function proceedFromTurnGate() {
    state.value = 'selection'
    if (turn.value) {
      turn.value.phase = 'selection'
    }
    generateAndSetSlots()
  }

  async function generateAndSetSlots() {
    if (!rng.value || !turn.value) return
    const corpus = useCorpusStore()
    if (!corpus.loaded) return

    const player = players.value[currentPlayerIndex.value]
    if (!player) return

    const boostEligible = isBoostEligible(round.value, players.value, currentPlayerIndex.value)
    const boostSlots = boostEligible ? assignBoostSlots(rng.value) : []

    const slots = generateSlots(
      rng.value,
      corpus.questions,
      player,
      settings.value,
      usedQuestionIds.value,
      turn.value.curse_active,
      boostSlots,
    )

    // Load teaser titles from question JSON files
    const lang = settings.value.language
    await Promise.all(
      slots.map(async (slot) => {
        slot.teaser_title = await corpus.fetchTeaserTitle(slot.question_id, lang)
      }),
    )

    turn.value.boosted_slot_indices = boostSlots
    setOfferedSlots(slots)
  }

  // Transition: Set offered slots (called by engine)
  function setOfferedSlots(slots: OfferedSlot[]) {
    if (turn.value) {
      turn.value.offered_slots = slots
    }
  }

  // Transition: Player selects a slot
  async function selectSlot(slotIndex: number) {
    if (!turn.value) return
    turn.value.selected_slot_index = slotIndex
    const slot = turn.value.offered_slots[slotIndex]
    if (!slot) return
    turn.value.selected_question_id = slot.question_id

    // Fetch question data from corpus
    const corpus = useCorpusStore()
    const lang = settings.value.language
    const questionData = await corpus.fetchQuestionData(slot.question_id, lang)
    if (!questionData) {
      console.error(`Failed to load question ${slot.question_id} (lang=${lang})`)
      return
    }
    currentQuestion.value = questionData

    state.value = 'question_display'
    turn.value.phase = 'question_display'
  }

  // Set loaded question data
  function setQuestionData(q: QuestionData) {
    currentQuestion.value = q
  }

  // Transition: Player submits answer
  function submitAnswer(correct: boolean) {
    if (!turn.value) return
    const player = players.value[currentPlayerIndex.value]
    if (!player) return
    player.stats.questions_attempted++
    if (correct) {
      player.stats.questions_correct++
      state.value = 'answer_correct'
      turn.value.phase = 'answer_correct'
    } else {
      state.value = 'answer_wrong'
      turn.value.phase = 'answer_wrong'
    }
  }

  // Transition: From answer_correct -> peg_placement
  function proceedToPlacement() {
    if (!turn.value || !rng.value) return
    // Calculate pegs
    let pegs = 1
    const slotIdx = turn.value.selected_slot_index
    const slot = slotIdx !== null ? turn.value.offered_slots[slotIdx] : null
    if (slot?.has_2x_boost) pegs++
    if (turn.value.double_down_active) pegs++
    turn.value.pegs_remaining = pegs
    turn.value.placing_player_index = currentPlayerIndex.value

    // Generate placement rule and candidate fields
    const player = players.value[currentPlayerIndex.value]
    if (slot && player) {
      const rule = placementRuleForSlot(slot, settings.value)
      turn.value.placement_rule = rule
      turn.value.candidate_fields = generateCandidates(rng.value, player.board, rule)
    }

    state.value = 'peg_placement'
    turn.value.phase = 'peg_placement'
  }

  // Transition: From answer_wrong
  function proceedFromWrongAnswer() {
    if (!turn.value) return
    const prevPlayer = turn.value.previous_round_player_index
    if (round.value >= 2 && prevPlayer !== null) {
      state.value = 'pass_gate'
      turn.value.phase = 'pass_gate'
      turn.value.pass = {
        pass_player_index: prevPlayer,
        original_answer_index: -1,
        scrambled_order: [],
        result: null,
      }
    } else {
      // No pass available, end turn
      _endTurn()
    }
  }

  // Transition: Place a peg
  function placePeg(row: number, col: number) {
    if (!turn.value) return
    const placingPlayer = players.value[turn.value.placing_player_index]
    if (!placingPlayer) return
    const boardRow = placingPlayer.board.fields[row]
    if (!boardRow) return
    boardRow[col] = true
    placingPlayer.board.peg_count++
    turn.value.pegs_remaining--
    // Check for win
    const line = checkWin(placingPlayer.board)
    if (line) {
      winnerPlayerIndex.value = turn.value.placing_player_index
      winningLine.value = line
      state.value = 'victory'
      status.value = 'finished'
      if (turn.value) turn.value.phase = 'victory'
      return
    }
    if (turn.value.pegs_remaining > 0) {
      // Regenerate candidates for next peg placement
      if (rng.value && turn.value.placement_rule) {
        turn.value.candidate_fields = generateCandidates(rng.value, placingPlayer.board, turn.value.placement_rule)
      }
      state.value = 'peg_placement'
    }
    // When pegs_remaining === 0, stay in peg_placement state.
    // The screen will call confirmEndTurn() when the player taps to continue.
  }

  function confirmEndTurn() {
    _endTurn()
  }

  function _endTurn() {
    state.value = 'turn_end'
    // Advance to next player
    currentPlayerIndex.value = (currentPlayerIndex.value + 1) % players.value.length
    if (currentPlayerIndex.value === 0) round.value++
    // Start next turn
    state.value = 'turn_start'
    _initTurn()
  }

  // Transition: Pass gate -> pass answering
  function proceedFromPassGate() {
    if (!turn.value) return
    state.value = 'pass_answering'
    turn.value.phase = 'pass_answering'
  }

  // Transition: Pass answer submitted
  function submitPassAnswer(result: 'correct' | 'wrong' | 'declined') {
    if (!turn.value?.pass) return
    turn.value.pass.result = result
    if (result === 'correct') {
      const passPlayer = players.value[turn.value.pass.pass_player_index]
      if (!passPlayer || !rng.value) return
      passPlayer.stats.passes_correct++
      turn.value.pegs_remaining = 1
      turn.value.placing_player_index = turn.value.pass.pass_player_index

      // Generate placement rule and candidates for pass placement
      const rule = passPlacementRule(settings.value)
      turn.value.placement_rule = rule
      turn.value.candidate_fields = generateCandidates(rng.value, passPlayer.board, rule)

      state.value = 'peg_placement'
      turn.value.phase = 'peg_placement'
    } else {
      state.value = 'pass_resolve'
      turn.value.phase = 'pass_resolve'
    }
  }

  // Transition: resolve pass (wrong/declined) -> end turn
  function proceedFromPassResolve() {
    _endTurn()
  }

  // Joker actions
  function useJoker(type: JokerType) {
    if (!turn.value) return
    const player = players.value[currentPlayerIndex.value]
    if (!player) return
    if (player.jokers[type] <= 0) return
    if (turn.value.jokers_used_this_turn.has(type)) return
    player.jokers[type]--
    turn.value.jokers_used_this_turn.add(type)
    player.stats.jokers_used++
  }

  function revealHint() {
    if (!turn.value) return
    useJoker('reveal_hint')
    turn.value.hint_revealed = true
  }

  function activateDoubleDown() {
    if (!turn.value) return
    useJoker('double_down')
    turn.value.double_down_active = true
  }

  // Reset for new game
  function resetGame() {
    state.value = 'setup'
    setupPhase.value = 'start'
    status.value = 'setup'
    players.value = []
    currentPlayerIndex.value = 0
    round.value = 1
    turn.value = null
    winnerPlayerIndex.value = null
    winningLine.value = null
    usedQuestionIds.value.clear()
    currentQuestion.value = null
    rng.value = null
  }

  return {
    // State
    state,
    sessionId,
    status,
    players,
    currentPlayerIndex,
    round,
    turn,
    winnerPlayerIndex,
    winningLine,
    usedQuestionIds,
    settings,
    currentQuestion,
    setupPhase,

    // Computed
    currentPlayer,
    isCorrect,

    // Setup actions
    goToPlayerSetup,
    goToStart,
    addPlayer,
    removePlayer,
    updateSettings,
    getAvailableColors,

    // Game transitions
    startGame,
    proceedFromTurnGate,
    generateAndSetSlots,
    setOfferedSlots,
    selectSlot,
    setQuestionData,
    submitAnswer,
    proceedToPlacement,
    proceedFromWrongAnswer,
    placePeg,
    confirmEndTurn,
    proceedFromPassGate,
    submitPassAnswer,
    proceedFromPassResolve,
    useJoker,
    revealHint,
    activateDoubleDown,
    resetGame,
  }
})
