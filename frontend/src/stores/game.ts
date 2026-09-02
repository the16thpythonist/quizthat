import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
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
  QuestionMeta,
  MultipleChoiceAnswerData,
  BattleState,
  BattleAnswer,
  EstimationAnswerData,
  BattleMapAnswerData,
  JokerType,
  BasicJokerType,
  SpecialJokerType,
  SessionStatus,
} from '../types/session'
import { PLAYER_COLORS, BOARD_SIZE } from '../types/session'
import { rankBattle, pickTransferField, haversineKm, checkWin, generateSlots, assignBoostSlots, assignJokerSlots, isBoostEligible, placementRuleForSlot, generateCandidates, passPlacementRule, gamblerPlacementRule, filterQuestions } from '../engine/algorithms'
import { GameRng } from '../engine/rng'
import {
  pickBattleIntro,
  pickBattleReveal,
  pickPlayerIntroLine,
  pickTurnLine,
  pickVerdictRemark,
  pickVictoryRemark,
} from '../engine/algorithms'
import { useCorpusStore } from './corpus'

function createBoard(size: number): Board {
  return {
    size,
    fields: Array.from({ length: size }, () => Array(size).fill(false)),
    peg_count: 0,
  }
}

const SPECIAL_JOKER_TYPES: SpecialJokerType[] = ['duel', 'curse', 'snipe', 'double_down']

const ALL_JOKER_TYPES: JokerType[] = [
  'reshuffle_selection',
  'reshuffle_question',
  'reveal_hint',
  'the_gambler',
  'duel',
  'curse',
  'snipe',
  'double_down',
]

function createJokerInventory(): JokerInventory {
  return {
    reshuffle_selection: 1,
    reshuffle_question: 1,
    reveal_hint: 1,
    the_gambler: 1,
    duel: 0,
    curse: 0,
    snipe: 0,
    double_down: 0,
  }
}

/**
 * crypto.randomUUID() only exists in a secure context, so it is missing over
 * plain HTTP on anything but localhost — which is exactly how the game gets
 * opened on a tablet on the local network. Falls back to a random id there.
 */
function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
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
  const winningLines = ref<[number, number][][] | null>(null)
  const usedQuestionIds = ref<Set<string>>(new Set())
  const settings = ref<GameSettings>({
    placement_candidates: 2,
    starting_pegs: 0,
    lines_to_win: 1,
    language: 'de',
  })

  // Current question data (loaded on demand)
  const currentQuestion = ref<QuestionData | null>(null)

  /** The joker just handed out, for the award screen to show. */
  const jokerAwarded = ref<JokerType | null>(null)

  /** The battle that closes the current round, or null between them. */
  const battle = ref<BattleState | null>(null)

  /** Outcome of the last Gambler, for its resolve screen. */
  const gamblerWon = ref(false)

  // Seeded RNG for deterministic gameplay
  // shallowRef, not ref: Vue's deep unwrapping rewrites a class instance into a
  // structural type that drops its private members, so `ref<GameRng>` no longer
  // satisfies `GameRng` at any call site. A PRNG has no business being deeply
  // reactive either — nothing renders from its internals.
  const rng = shallowRef<GameRng | null>(null)
  /**
   * Voice-line key for the narrator's roster callout, chosen in
   * goToGameSettings() — i.e. when the player confirms the roster with "Weiter".
   * App.vue plays it; the store stays free of audio concerns.
   */
  const playerIntroLine = ref<string | null>(null)
  /**
   * Voice-line key for the narrator's remark on the answer screen. Chosen when
   * the verdict is set, off the session RNG, so a replay says the same thing.
   */
  const verdictRemark = ref<string | null>(null)
  /** Colour-independent line that follows the winner callout. */
  const victoryRemark = ref<string | null>(null)
  /**
   * Which phrasing of the "your turn" callout the gate should use. Re-picked on
   * every turn, off the session RNG, so the variant sequence replays too.
   */
  const turnLine = ref<string | null>(null)
  /** Which announcement / reveal phrasing this battle uses. */
  const battleIntroLine = ref<string | null>(null)
  const battleRevealLine = ref<string | null>(null)

  // UI sub-state: which phase of setup we're in
  const setupPhase = ref<'start' | 'player_setup' | 'game_settings' | 'app_settings'>('start')

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

  function goToGameSettings() {
    setupPhase.value = 'game_settings'
    // The narrator sizes up the roster as the players are confirmed. Picked here
    // rather than in startGame() because that is where it is heard, and re-picked
    // on each pass so going back and forth varies the line. The session RNG does
    // not exist yet, hence a standalone GameRng — still the seeded PRNG, never
    // Math.random().
    playerIntroLine.value = pickPlayerIntroLine(new GameRng(Date.now()), players.value.length)
  }

  /** App-wide settings (audio, language), reached from the title screen. */
  function goToAppSettings() {
    setupPhase.value = 'app_settings'
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

  /** Lets an expertise be corrected without removing and re-adding the player. */
  function updatePlayerExpertise(index: number, expertise: Expertise) {
    const player = players.value[index]
    if (!player) return
    player.expertise = { ...expertise }
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
    sessionId.value = newSessionId()
    status.value = 'in_progress'
    currentPlayerIndex.value = 0
    round.value = 1
    state.value = 'turn_start'
    // The engine will handle TURN_START -> SELECTION transition
    _initTurn()
  }

  function _initTurn() {
    const active = players.value[currentPlayerIndex.value]
    if (rng.value && active) turnLine.value = pickTurnLine(rng.value, active.color)

    // A curse laid on this player last round bites now, and is spent doing so.
    const cursed = active?.is_cursed ?? false
    if (active) active.is_cursed = false

    const prevPlayer = _previousRoundPlayerIndex()
    turn.value = {
      active_player_index: currentPlayerIndex.value,
      previous_round_player_index: prevPlayer,
      phase: state.value,
      offered_slots: [],
      selected_slot_index: null,
      selected_question_id: null,
      boosted_slot_indices: [],
      curse_active: cursed,
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
      answer_order: [],
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

    // Everyone has a small chance of a 2x; the trailing player's is raised.
    const boostEligible = isBoostEligible(round.value, players.value, currentPlayerIndex.value)
    const boostSlots = assignBoostSlots(rng.value, boostEligible)
    const jokerSlots = assignJokerSlots(rng.value)

    const slots = generateSlots(
      rng.value,
      corpus.questions,
      player,
      settings.value,
      usedQuestionIds.value,
      turn.value.curse_active,
      boostSlots,
      jokerSlots,
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

  /**
   * Four fresh questions in place of the current four.
   *
   * The chips are carried across unchanged rather than re-rolled: re-rolling
   * would let a player with several of these keep spinning until a joker landed
   * on the cheapest card.
   */
  async function reshuffleSelection() {
    if (!turn.value || !rng.value) return
    const player = players.value[currentPlayerIndex.value]
    if (!player) return
    const corpus = useCorpusStore()
    if (!corpus.loaded) return

    const previous = turn.value.offered_slots
    const boostSlots = previous.flatMap((slot, i) => (slot.has_2x_boost ? [i] : []))
    const jokerSlots = previous.flatMap((slot, i) => (slot.awards_joker ? [i] : []))

    // the questions just discarded should not come straight back
    const exclude = new Set(usedQuestionIds.value)
    for (const slot of previous) exclude.add(slot.question_id)

    useJoker('reshuffle_selection')

    const slots = generateSlots(
      rng.value,
      corpus.questions,
      player,
      settings.value,
      exclude,
      turn.value.curse_active,
      boostSlots,
      jokerSlots,
    )

    const lang = settings.value.language
    await Promise.all(
      slots.map(async (slot) => {
        slot.teaser_title = await corpus.fetchTeaserTitle(slot.question_id, lang)
      }),
    )
    setOfferedSlots(slots)
  }

  /**
   * Swap the current question for another in the same major category.
   *
   * Difficulty is deliberately not held constant: with this corpus a single
   * category at a single difficulty is often one question, and a joker that
   * usually finds nothing is worse than one that sometimes changes the stakes.
   */
  async function reshuffleQuestion() {
    if (!turn.value || !rng.value) return
    const idx = turn.value.selected_slot_index
    const slot = idx !== null && idx !== undefined ? turn.value.offered_slots[idx] : null
    if (!slot) return
    const corpus = useCorpusStore()

    const exclude = new Set(usedQuestionIds.value)
    exclude.add(slot.question_id)
    const candidates = filterQuestions(corpus.questions, {
      language: settings.value.language,
      majorCategory: slot.major_category,
      excludeIds: exclude,
    })
    if (candidates.length === 0) return

    const replacement = rng.value.pick(candidates)
    const data = await corpus.fetchQuestionData(replacement.id, settings.value.language)
    if (!data) return

    useJoker('reshuffle_question')
    slot.question_id = replacement.id
    slot.difficulty = replacement.difficulty
    turn.value.selected_question_id = replacement.id
    currentQuestion.value = data
    turn.value.hint_revealed = false
    _scrambleAnswers()
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

    // The joker is the bait: it lands before the question is even shown, so
    // picking a risky card is guaranteed to pay something even if the answer
    // is wrong. Only the peg is at stake.
    const awarded = slot.awards_joker ? _awardRandomJoker() : null

    // Fetch question data from corpus
    const corpus = useCorpusStore()
    const lang = settings.value.language
    const questionData = await corpus.fetchQuestionData(slot.question_id, lang)
    if (!questionData) {
      console.error(`Failed to load question ${slot.question_id} (lang=${lang})`)
      return
    }
    currentQuestion.value = questionData
    _scrambleAnswers()

    // The prize gets its own beat before the question appears — it is the
    // reason the player took this card, so it should not flash past behind
    // the question loading. The question is already fetched by now, so
    // "Weiter" goes straight to it.
    if (awarded) {
      jokerAwarded.value = awarded
      state.value = 'joker_award'
      turn.value.phase = 'joker_award'
      return
    }

    state.value = 'question_display'
    turn.value.phase = 'question_display'
  }

  /**
   * Choose the order the answer options are shown in.
   *
   * Two reasons. The corpus overwhelmingly puts the correct answer first — 13
   * of 16 multiple-choice questions have correct_index 0 — so showing options
   * in file order makes "A" almost always right. And SPEC 5.9 requires a fresh
   * scramble when the question is passed on, so positional memory from watching
   * the first player does not help.
   *
   * Uses the session RNG, so a seed still replays identically.
   */
  function _scrambleAnswers() {
    if (!turn.value || !rng.value) return
    const q = currentQuestion.value
    if (!q || q.question_type !== 'multiple_choice') {
      turn.value.answer_order = []
      return
    }
    const count = (q.answer_data as MultipleChoiceAnswerData).options.length
    turn.value.answer_order = rng.value.shuffle(
      Array.from({ length: count }, (_, i) => i),
    )
  }

  /** Leaves the award screen for the question that was already loaded. */
  function proceedFromJokerAward() {
    if (!turn.value) return
    state.value = 'question_display'
    turn.value.phase = 'question_display'
  }

  /** Any of the eight joker types, basic or special. Returns what was given. */
  function _awardRandomJoker(): JokerType | null {
    if (!rng.value || !turn.value) return null
    const player = players.value[currentPlayerIndex.value]
    if (!player) return null
    const type = rng.value.pick(ALL_JOKER_TYPES)
    player.jokers[type]++
    // recorded in whichever field matches its kind, for the turn summary
    if (SPECIAL_JOKER_TYPES.includes(type as SpecialJokerType)) {
      turn.value.special_joker_earned = type as SpecialJokerType
    } else {
      turn.value.basic_joker_earned = type as BasicJokerType
    }
    return type
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
    // Narrator's remark for this verdict, picked here so it is seeded off the
    // session RNG and fixed before the screen renders.
    if (rng.value) verdictRemark.value = pickVerdictRemark(rng.value, correct)
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

    // Generate placement rule and candidate fields.
    //
    // A rule is always produced, even without a slot: entering peg placement
    // with none leaves the board with nothing lit and no way forward, which
    // strands the player on a dead screen rather than failing loudly.
    const player = players.value[currentPlayerIndex.value]
    if (player) {
      const rule = slot
        ? placementRuleForSlot(slot, settings.value)
        : passPlacementRule(settings.value)
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
    const lines = checkWin(placingPlayer.board, settings.value.lines_to_win)
    if (lines) {
      winnerPlayerIndex.value = turn.value.placing_player_index
      winningLines.value = lines
      // Follow-up line after the winner is named, seeded off the session RNG.
      if (rng.value) victoryRemark.value = pickVictoryRemark(rng.value)
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

  /**
   * Take several fields in one go.
   *
   * An 'auto' reveal has no interaction between the fields settling and them
   * being taken, so they are placed together and the win is checked once, at
   * the end — not after each peg, which would declare a win mid-animation.
   */
  function placePegs(fields: [number, number][]) {
    if (!turn.value) return
    const player = players.value[turn.value.placing_player_index]
    if (!player) return

    for (const [row, col] of fields) {
      const boardRow = player.board.fields[row]
      if (!boardRow || boardRow[col]) continue
      boardRow[col] = true
      player.board.peg_count++
      turn.value.pegs_remaining = Math.max(0, turn.value.pegs_remaining - 1)
    }

    const lines = checkWin(player.board, settings.value.lines_to_win)
    if (lines) {
      winnerPlayerIndex.value = turn.value.placing_player_index
      winningLines.value = lines
      state.value = 'victory'
      status.value = 'finished'
      turn.value.phase = 'victory'
      return
    }

    if (turn.value.pegs_remaining > 0 && rng.value && turn.value.placement_rule) {
      turn.value.candidate_fields = generateCandidates(
        rng.value,
        player.board,
        turn.value.placement_rule,
      )
    }
  }

  function confirmEndTurn() {
    _endTurn()
  }

  function _endTurn() {
    state.value = 'turn_end'
    // Advance to next player
    const wasLast = currentPlayerIndex.value === players.value.length - 1
    currentPlayerIndex.value = (currentPlayerIndex.value + 1) % players.value.length
    if (currentPlayerIndex.value === 0) round.value++

    // Everyone has played: the round closes with a battle before the next one.
    if (wasLast && _startBattle()) return
    // Start next turn
    state.value = 'turn_start'
    _initTurn()
  }

  // ─── Battles ──────────────────────────────────────────────────

  /**
   * Open the battle that closes a round.
   *
   * Returns false when there is nothing to run — no battle questions left, or
   * fewer than two players — so the caller can simply carry on to the next
   * round rather than stranding play on a screen with no question.
   */
  function _pickBattleQuestion(): QuestionMeta | null {
    if (!rng.value) return null
    const corpus = useCorpusStore()
    const candidates = filterQuestions(corpus.questions, {
      language: settings.value.language,
      excludeIds: usedQuestionIds.value,
      battleOnly: true,
    })
    if (candidates.length === 0) return null
    const question = rng.value.pick(candidates)
    usedQuestionIds.value.add(question.id)
    return question
  }

  function _startBattle(): boolean {
    if (!rng.value || players.value.length < 2) return false
    const question = _pickBattleQuestion()
    if (!question) return false

    battle.value = {
      question_id: question.id,
      challenger_index: null,
      question_type: question.question_type as 'estimation' | 'battle_map',
      order: players.value.map((p) => p.index),
      answers: [],
      transfer: null,
      winner_index: null,
      loser_index: null,
    }
    // Narrator phrasings for this battle, seeded so a replay says the same.
    battleIntroLine.value = pickBattleIntro(rng.value)
    battleRevealLine.value = pickBattleReveal(rng.value)
    state.value = 'battle_intro'
    return true
  }

  /** Whose turn it is to answer, or null once everyone has. */
  const battlePlayerIndex = computed(() => {
    const b = battle.value
    if (!b) return null
    return b.order[b.answers.length] ?? null
  })

  const battlePlayer = computed(() =>
    battlePlayerIndex.value === null ? null : players.value[battlePlayerIndex.value] ?? null,
  )

  async function proceedFromBattleIntro() {
    const b = battle.value
    if (!b) return
    const corpus = useCorpusStore()
    const data = await corpus.fetchQuestionData(b.question_id, settings.value.language)
    if (data) currentQuestion.value = data
    state.value = 'battle_gate'
  }

  function proceedFromBattleGate() {
    state.value = 'battle_answering'
  }

  /**
   * Record one player's answer and move on — to the next player, or to the
   * reveal once everybody has had the device.
   */
  function submitBattleAnswer(value: number | [number, number]) {
    const b = battle.value
    const playerIndex = battlePlayerIndex.value
    const question = currentQuestion.value
    if (!b || playerIndex === null || !question) return

    let distance: number
    if (b.question_type === 'estimation') {
      const target = (question.answer_data as EstimationAnswerData).correct_value
      distance = Math.abs((value as number) - target)
    } else {
      const target = (question.answer_data as BattleMapAnswerData).target
      distance = haversineKm(value as [number, number], [target.lat, target.lng])
    }

    b.answers.push({ player_index: playerIndex, value, distance } as BattleAnswer)

    if (b.answers.length < b.order.length) {
      state.value = 'battle_gate'
      return
    }
    _resolveBattle()
  }

  /** Rank, then move one peg from last place to first — same square. */
  function _resolveBattle() {
    const b = battle.value
    if (!b || !rng.value) return

    const outcome = rankBattle(b.answers.map((a) => ({
      player_index: a.player_index,
      distance: a.distance,
    })))
    b.winner_index = outcome.winnerIndex
    b.loser_index = outcome.loserIndex

    const winner = outcome.winnerIndex !== null ? players.value[outcome.winnerIndex] : null
    const loser = outcome.loserIndex !== null ? players.value[outcome.loserIndex] : null

    // A duel only ever moves a peg towards the challenger: losing it costs
    // them nothing but the joker.
    const duelLost = b.challenger_index !== null && outcome.winnerIndex !== b.challenger_index

    if (winner && loser && !duelLost && loser.board.peg_count > 0) {
      const field = pickTransferField(rng.value, loser.board, winner.board)
      if (field) {
        const [row, col] = field
        loser.board.fields[row]![col] = false
        loser.board.peg_count--
        winner.board.fields[row]![col] = true
        winner.board.peg_count++
        loser.stats.pegs_stolen_from++
        b.transfer = { from: loser.index, to: winner.index, field }
      }
    }

    // Deliberately no win check: a battle never ends the game (IDEA.md). A line
    // completed by a transferred peg is honoured at the winner's next placement.
    state.value = 'battle_reveal'
  }

  /**
   * Leave the battle.
   *
   * A round battle opens the next turn; a duel was only an interlude inside the
   * challenger's own turn, so it hands them back their selection screen.
   */
  function proceedFromBattleReveal() {
    const wasDuel = battle.value !== null && battle.value.challenger_index !== null
    battle.value = null
    currentQuestion.value = null
    if (wasDuel) {
      state.value = 'selection'
      if (turn.value) turn.value.phase = 'selection'
      return
    }
    state.value = 'turn_start'
    _initTurn()
  }

  // Transition: Pass gate -> pass answering
  function proceedFromPassGate() {
    if (!turn.value) return
    // Re-scrambled for the inheriting player: they watched the first attempt,
    // so the options must not be in the same places.
    _scrambleAnswers()
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

  /**
   * Mark an opponent so their next turn's ordinary slots are all Hard.
   * Consumed when that player's turn begins, not here.
   */
  function applyCurse(targetIndex: number) {
    const target = players.value[targetIndex]
    if (!target || targetIndex === currentPlayerIndex.value) return
    useJoker('curse')
    target.is_cursed = true
  }

  /** Remove one chosen peg from an opponent's board. */
  function snipePeg(targetIndex: number, row: number, col: number) {
    const target = players.value[targetIndex]
    if (!target || targetIndex === currentPlayerIndex.value) return
    const boardRow = target.board.fields[row]
    if (!boardRow?.[col]) return
    useJoker('snipe')
    boardRow[col] = false
    target.board.peg_count--
  }

  /**
   * Challenge one opponent to a battle question for one of their pegs.
   *
   * The softer half of the old Steal: the peg only moves if the challenger is
   * closer, and a loss costs them nothing beyond the joker itself. Runs the
   * round battle's own screens with an order of exactly two.
   */
  function startDuel(targetIndex: number) {
    if (!turn.value || !rng.value) return
    const target = players.value[targetIndex]
    if (!target || targetIndex === currentPlayerIndex.value) return
    const question = _pickBattleQuestion()
    if (!question) return

    useJoker('duel')
    battle.value = {
      question_id: question.id,
      challenger_index: currentPlayerIndex.value,
      question_type: question.question_type as 'estimation' | 'battle_map',
      order: [currentPlayerIndex.value, targetIndex],
      answers: [],
      transfer: null,
      winner_index: null,
      loser_index: null,
    }
    battleIntroLine.value = pickBattleIntro(rng.value)
    battleRevealLine.value = pickBattleReveal(rng.value)
    state.value = 'battle_intro'
  }

  // ─── The Gambler ──────────────────────────────────────────────

  /**
   * Stake one of the player's own pegs, chosen at random, on a wild question.
   *
   * The peg is only identified here — it is removed on a wrong answer, not up
   * front, so the confirmation can show exactly what is at risk.
   */
  function startGambler() {
    if (!turn.value || !rng.value) return
    const player = players.value[currentPlayerIndex.value]
    if (!player || player.board.peg_count < 1) return

    const owned: [number, number][] = []
    for (let r = 0; r < player.board.size; r++) {
      for (let c = 0; c < player.board.size; c++) {
        if (player.board.fields[r]?.[c]) owned.push([r, c])
      }
    }
    if (owned.length === 0) return

    turn.value.gambler_staked_field = rng.value.pick(owned)
    state.value = 'gambler_confirm'
    turn.value.phase = 'gambler_confirm'
  }

  function cancelGambler() {
    if (!turn.value) return
    turn.value.gambler_staked_field = null
    state.value = 'selection'
    turn.value.phase = 'selection'
  }

  /** Any category, any difficulty — the point is that it is unpredictable. */
  async function confirmGambler() {
    if (!turn.value || !rng.value) return
    const corpus = useCorpusStore()
    const candidates = filterQuestions(corpus.questions, {
      language: settings.value.language,
      excludeIds: new Set(usedQuestionIds.value),
    })
    if (candidates.length === 0) return

    const question = rng.value.pick(candidates)
    const data = await corpus.fetchQuestionData(question.id, settings.value.language)
    if (!data) return

    useJoker('the_gambler')
    turn.value.selected_question_id = question.id
    currentQuestion.value = data
    state.value = 'gambler_question'
    turn.value.phase = 'gambler_question'
    _scrambleAnswers()
  }

  /**
   * Right: the win is announced, and the three pegs are then placed through the
   * ordinary placement screen. Wrong: the staked peg is taken.
   */
  function resolveGambler(correct: boolean) {
    if (!turn.value) return
    const player = players.value[currentPlayerIndex.value]
    if (!player) return

    player.stats.questions_attempted++
    if (correct) {
      player.stats.questions_correct++
    } else {
      const staked = turn.value.gambler_staked_field
      const boardRow = staked ? player.board.fields[staked[0]] : null
      if (staked && boardRow?.[staked[1]]) {
        boardRow[staked[1]] = false
        player.board.peg_count--
      }
    }

    gamblerWon.value = correct
    state.value = 'gambler_resolve'
    turn.value.phase = 'gambler_resolve'
  }

  /**
   * A win goes on to place its three pegs, a loss ends the turn.
   *
   * Placement runs through the ordinary screen with a single candidate, so each
   * peg gets the usual roulette — the reveal rattles across the board and
   * settles — and then lands on its own. The player watches all three arrive
   * but never chooses where any of them go.
   */
  function proceedFromGamblerResolve() {
    if (!turn.value || !rng.value || !gamblerWon.value) {
      _endTurn()
      return
    }
    const player = players.value[currentPlayerIndex.value]
    if (!player) {
      _endTurn()
      return
    }

    const rule = gamblerPlacementRule(settings.value) // three fields, all taken
    turn.value.pegs_remaining = 3
    turn.value.placing_player_index = currentPlayerIndex.value
    turn.value.placement_rule = rule
    turn.value.candidate_fields = generateCandidates(rng.value, player.board, rule)
    state.value = 'peg_placement'
    turn.value.phase = 'peg_placement'
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
    winningLines.value = null
    usedQuestionIds.value.clear()
    currentQuestion.value = null
    rng.value = null
    playerIntroLine.value = null
    verdictRemark.value = null
    victoryRemark.value = null
    turnLine.value = null
    battleIntroLine.value = null
    battleRevealLine.value = null
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
    winningLines,
    usedQuestionIds,
    settings,
    currentQuestion,
    jokerAwarded,
    battle,
    battlePlayer,
    battlePlayerIndex,
    gamblerWon,
    setupPhase,
    playerIntroLine,
    verdictRemark,
    victoryRemark,
    turnLine,
    battleIntroLine,
    battleRevealLine,

    // Computed
    currentPlayer,
    isCorrect,

    // Setup actions
    goToPlayerSetup,
    goToStart,
    goToGameSettings,
    goToAppSettings,
    addPlayer,
    updatePlayerExpertise,
    removePlayer,
    updateSettings,
    getAvailableColors,

    // Game transitions
    startGame,
    proceedFromTurnGate,
    generateAndSetSlots,
    setOfferedSlots,
    selectSlot,
    proceedFromJokerAward,
    setQuestionData,
    submitAnswer,
    proceedToPlacement,
    proceedFromWrongAnswer,
    placePeg,
    placePegs,
    confirmEndTurn,
    proceedFromBattleIntro,
    proceedFromBattleGate,
    submitBattleAnswer,
    proceedFromBattleReveal,
    proceedFromPassGate,
    submitPassAnswer,
    proceedFromPassResolve,
    useJoker,
    reshuffleSelection,
    reshuffleQuestion,
    applyCurse,
    snipePeg,
    startDuel,
    startGambler,
    cancelGambler,
    confirmGambler,
    resolveGambler,
    proceedFromGamblerResolve,
    revealHint,
    activateDoubleDown,
    resetGame,
  }
})
