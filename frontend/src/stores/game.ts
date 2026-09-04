import { defineStore } from 'pinia'
import { ref, computed, shallowRef, watch } from 'vue'
import type {
  GameSettings,
  GameSession,
  GameState,
  Player,
  PlayerColor,
  Board,
  JokerInventory,
  PlayerStats,
  Expertise,
  OfferedSlot,
  QuestionData,
  QuestionMeta,
  MultipleChoiceAnswerData,
  SortingAnswerData,
  AnswerResponse,
  BattleAnswer,
  EstimationAnswerData,
  BattleMapAnswerData,
  JokerType,
  BasicJokerType,
  SpecialJokerType,
} from '../types/session'
import { PLAYER_COLORS, BOARD_SIZE } from '../types/session'
import { isValidTransition } from '../engine/stateMachine'
import { rankBattle, pickTransferField, haversineKm, checkWin, gradeAnswer, calculatePegCount, generateSlots, assignBoostSlots, assignJokerSlots, isBoostEligible, placementRuleForSlot, generateCandidates, passPlacementRule, gamblerPlacementRule, filterQuestions } from '../engine/algorithms'
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
import { scheduleAutoSave, loadSession, deleteSession } from './persistence'

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

/**
 * A session in its pre-game state: no players, no seed, sitting on 'setup'.
 *
 * Every field of GameSession is written here so a fresh session and a resumed
 * one have exactly the same shape — a missing key would otherwise only surface
 * once something tried to serialize it.
 */
export function createSession(): GameSession {
  return {
    id: '',
    status: 'setup',
    settings: {
      placement_candidates: 2,
      starting_pegs: 0,
      lines_to_win: 1,
      language: 'de',
    },
    players: [],
    current_player_index: 0,
    round: 1,
    state: 'setup',
    turn: null,
    battle: null,
    winner_player_index: null,
    used_question_ids: new Set(),
    history: [],
    narration: {
      verdict_remark: null,
      victory_remark: null,
      turn_line: null,
      battle_intro: null,
      battle_reveal: null,
    },
    created_at: '',
    updated_at: '',
    rng_seed: 0,
    rng_state: null,
    winning_lines: null,
  }
}

/**
 * The wire contract: every player action, with its argument types.
 *
 * Stated once here and enforced against the real handlers — the store assigns
 * an object literal to this type, so a missing action is a missing-property
 * error and an extra one an excess-property error. Adding an action to the game
 * without deciding whether it belongs on the wire will not compile.
 *
 * Every argument is a primitive, a string enum, a number tuple or a plain JSON
 * object. Nothing here takes a callback, a ref or a class instance, which is
 * what makes the whole vocabulary serializable.
 */
export interface GameIntentMap {
  addPlayer: (name: string, color: PlayerColor, expertise: Expertise) => void
  updatePlayerExpertise: (index: number, expertise: Expertise) => void
  removePlayer: (index: number) => void
  updateSettings: (settings: Partial<GameSettings>) => void
  startGame: (seed?: number) => void
  proceedFromTurnGate: () => void
  selectSlot: (slotIndex: number) => Promise<void>
  proceedFromJokerAward: () => void
  submitAnswer: (response: AnswerResponse) => void
  proceedToPlacement: () => void
  proceedFromWrongAnswer: () => void
  placePeg: (row: number, col: number) => void
  placePegs: (fields: [number, number][]) => void
  confirmEndTurn: () => void
  proceedFromBattleIntro: () => Promise<void>
  proceedFromBattleGate: () => void
  submitBattleAnswer: (value: number | [number, number]) => void
  proceedFromBattleReveal: () => void
  proceedFromPassGate: () => void
  submitPassAnswer: (response: AnswerResponse | 'declined') => void
  proceedFromPassResolve: () => void
  reshuffleSelection: () => Promise<void>
  reshuffleQuestion: () => Promise<void>
  applyCurse: (targetIndex: number) => void
  snipePeg: (targetIndex: number, row: number, col: number) => void
  startDuel: (targetIndex: number) => void
  startGambler: () => void
  cancelGambler: () => void
  confirmGambler: () => Promise<void>
  resolveGambler: (response: AnswerResponse) => void
  proceedFromGamblerResolve: () => void
  revealHint: () => void
  activateDoubleDown: () => void
}

/**
 * One player action, ready to be applied locally or sent over the wire.
 *
 * Derived from the map rather than listed again, so the payload of an intent is
 * exactly the arguments of the action it names.
 */
export type GameIntent = {
  [K in keyof GameIntentMap]: {
    type: K
    args: Parameters<GameIntentMap[K]>
  }
}[keyof GameIntentMap]

export const useGameStore = defineStore('game', () => {
  /**
   * The single source of truth for a game (SPEC §9).
   *
   * Everything that must survive a reload — or, in multi-device play, reach
   * another device — lives in here, so a snapshot is just this object. The
   * exposed `players`, `round`, `turn` … below are read-only views onto it,
   * kept as separate names so screens read the store the way they always have.
   */
  const session = ref<GameSession>(createSession())

  /**
   * The question currently on screen.
   *
   * Outside the session on purpose: it is corpus payload, not game state, and
   * is re-fetchable at any time from `turn.selected_question_id`.
   */
  const currentQuestion = ref<QuestionData | null>(null)

  /**
   * Seeded RNG for deterministic gameplay. Its seed and position live in the
   * session; this is the live generator built from them.
   *
   * shallowRef, not ref: Vue's deep unwrapping rewrites a class instance into a
   * structural type that drops its private members, so `ref<GameRng>` no longer
   * satisfies `GameRng` at any call site. A PRNG has no business being deeply
   * reactive either — nothing renders from its internals.
   */
  const rng = shallowRef<GameRng | null>(null)

  /**
   * Voice-line key for the narrator's roster callout, chosen in
   * goToGameSettings() — i.e. when the player confirms the roster with "Weiter".
   * App.vue plays it; the store stays free of audio concerns.
   *
   * Outside the session because it is picked before a session exists.
   */
  const playerIntroLine = ref<string | null>(null)

  /** UI sub-state: which phase of setup we're in. Navigation, not game state. */
  const setupPhase = ref<'start' | 'player_setup' | 'game_settings' | 'app_settings'>('start')

  // ─── Read-only views onto the session ─────────────────────────
  // Screens read these; every write goes through an action below.

  const state = computed(() => session.value.state)
  const sessionId = computed(() => session.value.id)
  const status = computed(() => session.value.status)
  const players = computed(() => session.value.players)
  const currentPlayerIndex = computed(() => session.value.current_player_index)
  const round = computed(() => session.value.round)
  const turn = computed(() => session.value.turn)
  const battle = computed(() => session.value.battle)
  const winnerPlayerIndex = computed(() => session.value.winner_player_index)
  const winningLines = computed(() => session.value.winning_lines)
  const usedQuestionIds = computed(() => session.value.used_question_ids)
  const settings = computed(() => session.value.settings)
  const jokerAwarded = computed(() => session.value.turn?.joker_awarded ?? null)
  const gamblerWon = computed(() => session.value.turn?.gambler_won ?? false)
  const verdictRemark = computed(() => session.value.narration.verdict_remark)
  const victoryRemark = computed(() => session.value.narration.victory_remark)
  const turnLine = computed(() => session.value.narration.turn_line)
  const battleIntroLine = computed(() => session.value.narration.battle_intro)
  const battleRevealLine = computed(() => session.value.narration.battle_reveal)

  // Computed
  const currentPlayer = computed<Player | null>(() =>
    session.value.players[session.value.current_player_index] ?? null,
  )

  const isCorrect = computed(() => session.value.state === 'answer_correct')

  /**
   * Whose input the game is waiting on, as a seat index.
   *
   * On a shared tablet this is implicit — whoever is holding it. On separate
   * devices it has to be explicit, because every phone renders the same state
   * and only one of them should be able to act on it. Null means nobody in
   * particular: setup and the victory screen are anyone's to tap.
   *
   * It is not always the current player. The pass belongs to the player one
   * round behind, placement can belong to them too, and during a battle it
   * moves down the answering order.
   */
  const awaitingSeat = computed<number | null>(() => {
    const s = session.value
    switch (s.state) {
      case 'setup':
      case 'victory':
        return null
      case 'battle_intro':
      case 'battle_reveal':
        // Announcements: the host advances them so a slow phone cannot stall
        // the table waiting for one particular person to tap.
        return null
      case 'battle_gate':
      case 'battle_answering':
        return battlePlayerIndex.value
      case 'pass_gate':
      case 'pass_answering':
        return s.turn?.pass?.pass_player_index ?? null
      case 'peg_placement':
        return s.turn?.placing_player_index ?? s.current_player_index
      default:
        return s.current_player_index
    }
  })

  /**
   * What the current answer is worth.
   *
   * Exposed rather than recomputed on the verdict screen: the screen and
   * `proceedToPlacement` were each carrying their own copy of the arithmetic,
   * on top of `calculatePegCount` in the engine, which nothing called at all.
   */
  const pegsEarned = computed(() => {
    const t = session.value.turn
    if (!t) return 1
    const idx = t.selected_slot_index
    const slot = idx !== null ? t.offered_slots[idx] : null
    return calculatePegCount(slot?.has_2x_boost ?? false, t.double_down_active)
  })

  /**
   * Records the generator's position and the edit time.
   *
   * Called after anything that draws from the RNG, so a save or a snapshot can
   * resume the sequence instead of rewinding it.
   */
  function _touch() {
    if (rng.value) session.value.rng_state = rng.value.saveState()
    session.value.updated_at = new Date().toISOString()
  }

  /**
   * The only way the game state changes.
   *
   * Every transition is checked against VALID_TRANSITIONS. Until now that table
   * was exported and never called, so nothing would have caught an illegal
   * move; once intents can arrive from another device, this is the layer that
   * refuses them. Throwing rather than warning is deliberate — an illegal
   * transition means the caller has a bug, and continuing from it would corrupt
   * the session that is about to be saved and broadcast.
   */
  function _setState(next: GameState) {
    const from = session.value.state
    if (from === next) return
    if (!isValidTransition(from, next)) {
      throw new Error(`Illegal state transition: ${from} -> ${next}`)
    }
    session.value.state = next
  }

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
    playerIntroLine.value = pickPlayerIntroLine(
      new GameRng(Date.now()),
      session.value.players.length,
    )
  }

  /** App-wide settings (audio, language), reached from the title screen. */
  function goToAppSettings() {
    setupPhase.value = 'app_settings'
  }

  function addPlayer(name: string, color: PlayerColor, expertise: Expertise) {
    const player: Player = {
      index: session.value.players.length,
      name: name || color.charAt(0).toUpperCase() + color.slice(1),
      color,
      expertise,
      board: createBoard(BOARD_SIZE),
      jokers: createJokerInventory(),
      stats: createStats(),
      is_cursed: false,
    }
    session.value.players.push(player)
  }

  /** Lets an expertise be corrected without removing and re-adding the player. */
  function updatePlayerExpertise(index: number, expertise: Expertise) {
    const player = session.value.players[index]
    if (!player) return
    player.expertise = { ...expertise }
  }

  function removePlayer(index: number) {
    session.value.players.splice(index, 1)
    session.value.players.forEach((p, i) => (p.index = i))
  }

  function updateSettings(newSettings: Partial<GameSettings>) {
    Object.assign(session.value.settings, newSettings)
  }

  function getAvailableColors(): PlayerColor[] {
    const usedColors = new Set(session.value.players.map((p) => p.color))
    return PLAYER_COLORS.filter((c) => !usedColors.has(c))
  }

  // --- Game transitions ---

  /**
   * Begin play.
   *
   * `seed` is injectable so a game can be replayed exactly; left out, the clock
   * provides one. Either way it is stored, which is what makes replay possible
   * at all — before this it was drawn and discarded.
   */
  function startGame(seed: number = Date.now()) {
    if (session.value.players.length < 2) return
    const now = new Date().toISOString()
    rng.value = new GameRng(seed)
    session.value.rng_seed = seed
    session.value.id = newSessionId()
    session.value.status = 'in_progress'
    session.value.current_player_index = 0
    session.value.round = 1
    _setState('turn_start')
    session.value.created_at = now
    session.value.updated_at = now
    // The engine will handle TURN_START -> SELECTION transition
    _initTurn()
  }

  function _initTurn() {
    const active = session.value.players[session.value.current_player_index]
    if (rng.value && active) {
      session.value.narration.turn_line = pickTurnLine(rng.value, active.color)
    }

    // A curse laid on this player last round bites now, and is spent doing so.
    const cursed = active?.is_cursed ?? false
    if (active) active.is_cursed = false

    const prevPlayer = _previousRoundPlayerIndex()
    session.value.turn = {
      active_player_index: session.value.current_player_index,
      previous_round_player_index: prevPlayer,
      phase: session.value.state,
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
      placing_player_index: session.value.current_player_index,
      gambler_staked_field: null,
      pass: null,
      special_joker_earned: null,
      basic_joker_earned: null,
      candidate_fields: [],
      answer_order: [],
      joker_awarded: null,
      gambler_won: false,
    }
    _touch()
  }

  function _previousRoundPlayerIndex(): number | null {
    if (session.value.round === 1 && session.value.current_player_index === 0) return null
    return (
      (session.value.current_player_index - 1 + session.value.players.length) %
      session.value.players.length
    )
  }

  // Transition: Player taps "continue" on TurnGateScreen
  function proceedFromTurnGate() {
    _setState('selection')
    if (session.value.turn) {
      session.value.turn.phase = 'selection'
    }
    generateAndSetSlots()
  }

  async function generateAndSetSlots() {
    const t = session.value.turn
    if (!rng.value || !t) return
    const corpus = useCorpusStore()
    if (!corpus.loaded) return

    const player = session.value.players[session.value.current_player_index]
    if (!player) return

    // Everyone has a small chance of a 2x; the trailing player's is raised.
    const boostEligible = isBoostEligible(
      session.value.round,
      session.value.players,
      session.value.current_player_index,
    )
    const boostSlots = assignBoostSlots(rng.value, boostEligible)
    const jokerSlots = assignJokerSlots(rng.value)

    const slots = generateSlots(
      rng.value,
      corpus.questions,
      player,
      session.value.settings,
      session.value.used_question_ids,
      t.curse_active,
      boostSlots,
      jokerSlots,
    )

    // Load teaser titles from question JSON files
    const lang = session.value.settings.language
    await Promise.all(
      slots.map(async (slot) => {
        slot.teaser_title = await corpus.fetchTeaserTitle(slot.question_id, lang)
      }),
    )

    t.boosted_slot_indices = boostSlots
    setOfferedSlots(slots)
    _touch()
  }

  /**
   * Four fresh questions in place of the current four.
   *
   * The chips are carried across unchanged rather than re-rolled: re-rolling
   * would let a player with several of these keep spinning until a joker landed
   * on the cheapest card.
   */
  async function reshuffleSelection() {
    const t = session.value.turn
    if (!t || !rng.value) return
    const player = session.value.players[session.value.current_player_index]
    if (!player) return
    const corpus = useCorpusStore()
    if (!corpus.loaded) return

    const previous = t.offered_slots
    const boostSlots = previous.flatMap((slot, i) => (slot.has_2x_boost ? [i] : []))
    const jokerSlots = previous.flatMap((slot, i) => (slot.awards_joker ? [i] : []))

    // the questions just discarded should not come straight back
    const exclude = new Set(session.value.used_question_ids)
    for (const slot of previous) exclude.add(slot.question_id)

    if (!useJoker('reshuffle_selection')) return

    const slots = generateSlots(
      rng.value,
      corpus.questions,
      player,
      session.value.settings,
      exclude,
      t.curse_active,
      boostSlots,
      jokerSlots,
    )

    const lang = session.value.settings.language
    await Promise.all(
      slots.map(async (slot) => {
        slot.teaser_title = await corpus.fetchTeaserTitle(slot.question_id, lang)
      }),
    )
    setOfferedSlots(slots)
    _touch()
  }

  /**
   * Swap the current question for another in the same major category.
   *
   * Difficulty is deliberately not held constant: with this corpus a single
   * category at a single difficulty is often one question, and a joker that
   * usually finds nothing is worse than one that sometimes changes the stakes.
   */
  async function reshuffleQuestion() {
    const t = session.value.turn
    if (!t || !rng.value) return
    const idx = t.selected_slot_index
    const slot = idx !== null && idx !== undefined ? t.offered_slots[idx] : null
    if (!slot) return
    const corpus = useCorpusStore()

    const exclude = new Set(session.value.used_question_ids)
    exclude.add(slot.question_id)
    const candidates = filterQuestions(corpus.questions, {
      language: session.value.settings.language,
      majorCategory: slot.major_category,
      excludeIds: exclude,
    })
    if (candidates.length === 0) return

    const replacement = rng.value.pick(candidates)
    const data = await corpus.fetchQuestionData(replacement.id, session.value.settings.language)
    if (!data) return
    if (!useJoker('reshuffle_question')) return

    slot.question_id = replacement.id
    slot.difficulty = replacement.difficulty
    t.selected_question_id = replacement.id
    currentQuestion.value = data
    t.hint_revealed = false
    _scrambleAnswers()
    _touch()
  }

  // Transition: Set offered slots (called by engine)
  function setOfferedSlots(slots: OfferedSlot[]) {
    if (session.value.turn) {
      session.value.turn.offered_slots = slots
    }
  }

  // Transition: Player selects a slot
  async function selectSlot(slotIndex: number) {
    const t = session.value.turn
    if (!t) return
    const slot = t.offered_slots[slotIndex]
    if (!slot) return

    // Fetch before touching the turn. The mutations used to run first and the
    // early return on a failed load left the turn pointing at a question that
    // never arrived — and, if the slot carried a chip, having already spent the
    // joker draw on it. Nothing observes the turn between here and the
    // assignments below, so this half of the action is now all-or-nothing.
    const corpus = useCorpusStore()
    const lang = session.value.settings.language
    const questionData = await corpus.fetchQuestionData(slot.question_id, lang)
    if (!questionData) {
      console.error(`Failed to load question ${slot.question_id} (lang=${lang})`)
      return
    }

    t.selected_slot_index = slotIndex
    t.selected_question_id = slot.question_id

    // The joker is the bait: it lands before the question is even shown, so
    // picking a risky card is guaranteed to pay something even if the answer
    // is wrong. Only the peg is at stake.
    const awarded = slot.awards_joker ? _awardRandomJoker() : null

    currentQuestion.value = questionData
    _scrambleAnswers()

    // The prize gets its own beat before the question appears — it is the
    // reason the player took this card, so it should not flash past behind
    // the question loading. The question is already fetched by now, so
    // "Weiter" goes straight to it.
    if (awarded) {
      t.joker_awarded = awarded
      _setState('joker_award')
      t.phase = 'joker_award'
      _touch()
      return
    }

    _setState('question_display')
    t.phase = 'question_display'
    _touch()
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
    const t = session.value.turn
    if (!t || !rng.value) return
    const q = currentQuestion.value
    // Sorting items are shuffled for the same reason and by the same rule: the
    // corpus lists them already sorted, so presenting them in file order would
    // hand over the answer. Previously the sorting screen shuffled them itself
    // with Math.random(), which no seed could reproduce.
    const count =
      q?.question_type === 'multiple_choice'
        ? (q.answer_data as MultipleChoiceAnswerData).options.length
        : q?.question_type === 'sorting'
          ? (q.answer_data as SortingAnswerData).items.length
          : 0
    if (count === 0) {
      t.answer_order = []
      return
    }
    t.answer_order = rng.value.shuffle(Array.from({ length: count }, (_, i) => i))
  }

  /** Verdict on the question currently loaded. No question means no credit. */
  function _grade(response: AnswerResponse): boolean {
    const q = currentQuestion.value
    return q ? gradeAnswer(q, response) : false
  }

  /** Leaves the award screen for the question that was already loaded. */
  function proceedFromJokerAward() {
    const t = session.value.turn
    if (!t) return
    _setState('question_display')
    t.phase = 'question_display'
  }

  /** Any of the eight joker types, basic or special. Returns what was given. */
  function _awardRandomJoker(): JokerType | null {
    const t = session.value.turn
    if (!rng.value || !t) return null
    const player = session.value.players[session.value.current_player_index]
    if (!player) return null
    const type = rng.value.pick(ALL_JOKER_TYPES)
    player.jokers[type]++
    // recorded in whichever field matches its kind, for the turn summary
    if (SPECIAL_JOKER_TYPES.includes(type as SpecialJokerType)) {
      t.special_joker_earned = type as SpecialJokerType
    } else {
      t.basic_joker_earned = type as BasicJokerType
    }
    return type
  }

  // Set loaded question data
  function setQuestionData(q: QuestionData) {
    currentQuestion.value = q
  }

  /**
   * Grade what the player did and set the verdict.
   *
   * Takes the raw response, not a boolean: the screens used to decide
   * correctness themselves and the store believed them, which is untenable once
   * the answer can arrive from another device.
   */
  function submitAnswer(response: AnswerResponse) {
    const t = session.value.turn
    if (!t) return
    const player = session.value.players[session.value.current_player_index]
    if (!player) return
    const correct = _grade(response)
    player.stats.questions_attempted++
    // Narrator's remark for this verdict, picked here so it is seeded off the
    // session RNG and fixed before the screen renders.
    if (rng.value) {
      session.value.narration.verdict_remark = pickVerdictRemark(rng.value, correct)
    }
    if (correct) {
      player.stats.questions_correct++
      _setState('answer_correct')
      t.phase = 'answer_correct'
    } else {
      _setState('answer_wrong')
      t.phase = 'answer_wrong'
    }
    _touch()
  }

  // Transition: From answer_correct -> peg_placement
  function proceedToPlacement() {
    const t = session.value.turn
    if (!t || !rng.value) return
    const slotIdx = t.selected_slot_index
    const slot = slotIdx !== null ? t.offered_slots[slotIdx] : null
    t.pegs_remaining = pegsEarned.value
    t.placing_player_index = session.value.current_player_index

    // Generate placement rule and candidate fields.
    //
    // A rule is always produced, even without a slot: entering peg placement
    // with none leaves the board with nothing lit and no way forward, which
    // strands the player on a dead screen rather than failing loudly.
    const player = session.value.players[session.value.current_player_index]
    if (player) {
      const rule = slot
        ? placementRuleForSlot(slot, session.value.settings)
        : passPlacementRule(session.value.settings)
      t.placement_rule = rule
      t.candidate_fields = generateCandidates(rng.value, player.board, rule)
    }

    _setState('peg_placement')
    t.phase = 'peg_placement'
    _touch()
  }

  // Transition: From answer_wrong
  function proceedFromWrongAnswer() {
    const t = session.value.turn
    if (!t) return
    const prevPlayer = t.previous_round_player_index
    if (session.value.round >= 2 && prevPlayer !== null) {
      _setState('pass_gate')
      t.phase = 'pass_gate'
      t.pass = {
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
    const t = session.value.turn
    if (!t) return
    const placingPlayer = session.value.players[t.placing_player_index]
    if (!placingPlayer) return
    const boardRow = placingPlayer.board.fields[row]
    if (!boardRow) return
    boardRow[col] = true
    placingPlayer.board.peg_count++
    t.pegs_remaining--
    // Check for win
    const lines = checkWin(placingPlayer.board, session.value.settings.lines_to_win)
    if (lines) {
      _declareWin(t.placing_player_index, lines)
      return
    }
    if (t.pegs_remaining > 0) {
      // Regenerate candidates for next peg placement
      if (rng.value && t.placement_rule) {
        t.candidate_fields = generateCandidates(rng.value, placingPlayer.board, t.placement_rule)
      }
      _setState('peg_placement')
    }
    // When pegs_remaining === 0, stay in peg_placement state.
    // The screen will call confirmEndTurn() when the player taps to continue.
    _touch()
  }

  /**
   * Take several fields in one go.
   *
   * An 'auto' reveal has no interaction between the fields settling and them
   * being taken, so they are placed together and the win is checked once, at
   * the end — not after each peg, which would declare a win mid-animation.
   */
  function placePegs(fields: [number, number][]) {
    const t = session.value.turn
    if (!t) return
    const player = session.value.players[t.placing_player_index]
    if (!player) return

    for (const [row, col] of fields) {
      const boardRow = player.board.fields[row]
      if (!boardRow || boardRow[col]) continue
      boardRow[col] = true
      player.board.peg_count++
      t.pegs_remaining = Math.max(0, t.pegs_remaining - 1)
    }

    const lines = checkWin(player.board, session.value.settings.lines_to_win)
    if (lines) {
      _declareWin(t.placing_player_index, lines)
      return
    }

    if (t.pegs_remaining > 0 && rng.value && t.placement_rule) {
      t.candidate_fields = generateCandidates(rng.value, player.board, t.placement_rule)
    }
    _touch()
  }

  /**
   * End the game in favour of one player.
   *
   * Shared by the single- and multi-peg placement paths, which previously each
   * carried their own copy and had already drifted — only one of them picked
   * the narrator's follow-up line.
   */
  function _declareWin(playerIndex: number, lines: [number, number][][]) {
    session.value.winner_player_index = playerIndex
    session.value.winning_lines = lines
    // Follow-up line after the winner is named, seeded off the session RNG.
    if (rng.value) session.value.narration.victory_remark = pickVictoryRemark(rng.value)
    _setState('victory')
    session.value.status = 'finished'
    if (session.value.turn) session.value.turn.phase = 'victory'
    _touch()
  }

  function confirmEndTurn() {
    _endTurn()
  }

  function _endTurn() {
    _setState('turn_end')
    // Advance to next player
    const wasLast = session.value.current_player_index === session.value.players.length - 1
    session.value.current_player_index =
      (session.value.current_player_index + 1) % session.value.players.length
    if (session.value.current_player_index === 0) session.value.round++

    // Everyone has played: the round closes with a battle before the next one.
    if (wasLast && _startBattle()) return
    // Start next turn
    _setState('turn_start')
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
      language: session.value.settings.language,
      excludeIds: session.value.used_question_ids,
      battleOnly: true,
    })
    if (candidates.length === 0) return null
    const question = rng.value.pick(candidates)
    session.value.used_question_ids.add(question.id)
    return question
  }

  function _startBattle(): boolean {
    if (!rng.value || session.value.players.length < 2) return false
    const question = _pickBattleQuestion()
    if (!question) return false

    session.value.battle = {
      question_id: question.id,
      challenger_index: null,
      question_type: question.question_type as 'estimation' | 'battle_map',
      order: session.value.players.map((p) => p.index),
      answers: [],
      transfer: null,
      winner_index: null,
      loser_index: null,
    }
    // Narrator phrasings for this battle, seeded so a replay says the same.
    session.value.narration.battle_intro = pickBattleIntro(rng.value)
    session.value.narration.battle_reveal = pickBattleReveal(rng.value)
    _setState('battle_intro')
    _touch()
    return true
  }

  /** Whose turn it is to answer, or null once everyone has. */
  const battlePlayerIndex = computed(() => {
    const b = session.value.battle
    if (!b) return null
    return b.order[b.answers.length] ?? null
  })

  const battlePlayer = computed(() =>
    battlePlayerIndex.value === null
      ? null
      : session.value.players[battlePlayerIndex.value] ?? null,
  )

  async function proceedFromBattleIntro() {
    const b = session.value.battle
    if (!b) return
    const corpus = useCorpusStore()
    const data = await corpus.fetchQuestionData(b.question_id, session.value.settings.language)
    if (data) currentQuestion.value = data
    _setState('battle_gate')
  }

  function proceedFromBattleGate() {
    _setState('battle_answering')
  }

  /**
   * Record one player's answer and move on — to the next player, or to the
   * reveal once everybody has had the device.
   */
  function submitBattleAnswer(value: number | [number, number]) {
    const b = session.value.battle
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
      _setState('battle_gate')
      return
    }
    _resolveBattle()
  }

  /** Rank, then move one peg from last place to first — same square. */
  function _resolveBattle() {
    const b = session.value.battle
    if (!b || !rng.value) return

    const outcome = rankBattle(
      b.answers.map((a) => ({
        player_index: a.player_index,
        distance: a.distance,
      })),
    )
    b.winner_index = outcome.winnerIndex
    b.loser_index = outcome.loserIndex

    const winner = outcome.winnerIndex !== null ? session.value.players[outcome.winnerIndex] : null
    const loser = outcome.loserIndex !== null ? session.value.players[outcome.loserIndex] : null

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
    _setState('battle_reveal')
    _touch()
  }

  /**
   * Leave the battle.
   *
   * A round battle opens the next turn; a duel was only an interlude inside the
   * challenger's own turn, so it hands them back their selection screen.
   */
  function proceedFromBattleReveal() {
    const wasDuel =
      session.value.battle !== null && session.value.battle.challenger_index !== null
    session.value.battle = null
    currentQuestion.value = null
    if (wasDuel) {
      _setState('selection')
      if (session.value.turn) session.value.turn.phase = 'selection'
      return
    }
    _setState('turn_start')
    _initTurn()
  }

  // Transition: Pass gate -> pass answering
  function proceedFromPassGate() {
    const t = session.value.turn
    if (!t) return
    // Re-scrambled for the inheriting player: they watched the first attempt,
    // so the options must not be in the same places.
    _scrambleAnswers()
    _setState('pass_answering')
    t.phase = 'pass_answering'
    _touch()
  }

  /**
   * The inheriting player's attempt, or their refusal to take it.
   *
   * 'declined' is a genuine choice rather than a graded response, so it stays a
   * distinct value instead of being folded into a wrong answer — the stats and
   * the resolve screen both distinguish them.
   */
  function submitPassAnswer(response: AnswerResponse | 'declined') {
    const t = session.value.turn
    if (!t?.pass) return
    const result =
      response === 'declined' ? 'declined' : _grade(response) ? 'correct' : 'wrong'
    t.pass.result = result
    if (result === 'correct') {
      const passPlayer = session.value.players[t.pass.pass_player_index]
      if (!passPlayer || !rng.value) return
      passPlayer.stats.passes_correct++
      t.pegs_remaining = 1
      t.placing_player_index = t.pass.pass_player_index

      // Generate placement rule and candidates for pass placement
      const rule = passPlacementRule(session.value.settings)
      t.placement_rule = rule
      t.candidate_fields = generateCandidates(rng.value, passPlayer.board, rule)

      _setState('peg_placement')
      t.phase = 'peg_placement'
    } else {
      _setState('pass_resolve')
      t.phase = 'pass_resolve'
    }
    _touch()
  }

  // Transition: resolve pass (wrong/declined) -> end turn
  function proceedFromPassResolve() {
    _endTurn()
  }

  /**
   * Spend one joker, if the player has it and has not already played that type
   * this turn.
   *
   * Returns whether it was actually spent, and every caller must honour that.
   * They used to ignore it and apply the effect regardless, so a second Reveal
   * Hint in one turn still revealed the hint and a re-entered Curse still
   * cursed — the inventory was guarded but the effect was free.
   */
  function useJoker(type: JokerType): boolean {
    const t = session.value.turn
    if (!t) return false
    const player = session.value.players[session.value.current_player_index]
    if (!player) return false
    if (player.jokers[type] <= 0) return false
    if (t.jokers_used_this_turn.has(type)) return false
    player.jokers[type]--
    t.jokers_used_this_turn.add(type)
    player.stats.jokers_used++
    return true
  }

  /**
   * Mark an opponent so their next turn's ordinary slots are all Hard.
   * Consumed when that player's turn begins, not here.
   */
  function applyCurse(targetIndex: number) {
    const target = session.value.players[targetIndex]
    if (!target || targetIndex === session.value.current_player_index) return
    if (!useJoker('curse')) return
    target.is_cursed = true
  }

  /** Remove one chosen peg from an opponent's board. */
  function snipePeg(targetIndex: number, row: number, col: number) {
    const target = session.value.players[targetIndex]
    if (!target || targetIndex === session.value.current_player_index) return
    const boardRow = target.board.fields[row]
    if (!boardRow?.[col]) return
    if (!useJoker('snipe')) return
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
    if (!session.value.turn || !rng.value) return
    const target = session.value.players[targetIndex]
    if (!target || targetIndex === session.value.current_player_index) return
    // Drawn before the joker is spent so a corpus with no battle questions
    // left costs the player nothing.
    const question = _pickBattleQuestion()
    if (!question) return
    if (!useJoker('duel')) return

    session.value.battle = {
      question_id: question.id,
      challenger_index: session.value.current_player_index,
      question_type: question.question_type as 'estimation' | 'battle_map',
      order: [session.value.current_player_index, targetIndex],
      answers: [],
      transfer: null,
      winner_index: null,
      loser_index: null,
    }
    session.value.narration.battle_intro = pickBattleIntro(rng.value)
    session.value.narration.battle_reveal = pickBattleReveal(rng.value)
    _setState('battle_intro')
    _touch()
  }

  // ─── The Gambler ──────────────────────────────────────────────

  /**
   * Stake one of the player's own pegs, chosen at random, on a wild question.
   *
   * The peg is only identified here — it is removed on a wrong answer, not up
   * front, so the confirmation can show exactly what is at risk.
   */
  function startGambler() {
    const t = session.value.turn
    if (!t || !rng.value) return
    const player = session.value.players[session.value.current_player_index]
    if (!player || player.board.peg_count < 1) return

    const owned: [number, number][] = []
    for (let r = 0; r < player.board.size; r++) {
      for (let c = 0; c < player.board.size; c++) {
        if (player.board.fields[r]?.[c]) owned.push([r, c])
      }
    }
    if (owned.length === 0) return

    t.gambler_staked_field = rng.value.pick(owned)
    _setState('gambler_confirm')
    t.phase = 'gambler_confirm'
    _touch()
  }

  function cancelGambler() {
    const t = session.value.turn
    if (!t) return
    t.gambler_staked_field = null
    _setState('selection')
    t.phase = 'selection'
  }

  /** Any category, any difficulty — the point is that it is unpredictable. */
  async function confirmGambler() {
    const t = session.value.turn
    if (!t || !rng.value) return
    const corpus = useCorpusStore()
    const candidates = filterQuestions(corpus.questions, {
      language: session.value.settings.language,
      excludeIds: new Set(session.value.used_question_ids),
    })
    if (candidates.length === 0) return

    const question = rng.value.pick(candidates)
    const data = await corpus.fetchQuestionData(question.id, session.value.settings.language)
    if (!data) return
    if (!useJoker('the_gambler')) return

    t.selected_question_id = question.id
    currentQuestion.value = data
    _setState('gambler_question')
    t.phase = 'gambler_question'
    _scrambleAnswers()
    _touch()
  }

  /**
   * Right: the win is announced, and the three pegs are then placed through the
   * ordinary placement screen. Wrong: the staked peg is taken.
   */
  function resolveGambler(response: AnswerResponse) {
    const t = session.value.turn
    if (!t) return
    const player = session.value.players[session.value.current_player_index]
    if (!player) return

    const correct = _grade(response)
    player.stats.questions_attempted++
    if (correct) {
      player.stats.questions_correct++
    } else {
      const staked = t.gambler_staked_field
      const boardRow = staked ? player.board.fields[staked[0]] : null
      if (staked && boardRow?.[staked[1]]) {
        boardRow[staked[1]] = false
        player.board.peg_count--
      }
    }

    t.gambler_won = correct
    _setState('gambler_resolve')
    t.phase = 'gambler_resolve'
    _touch()
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
    const t = session.value.turn
    if (!t || !rng.value || !t.gambler_won) {
      _endTurn()
      return
    }
    const player = session.value.players[session.value.current_player_index]
    if (!player) {
      _endTurn()
      return
    }

    const rule = gamblerPlacementRule(session.value.settings) // three fields, all taken
    t.pegs_remaining = 3
    t.placing_player_index = session.value.current_player_index
    t.placement_rule = rule
    t.candidate_fields = generateCandidates(rng.value, player.board, rule)
    _setState('peg_placement')
    t.phase = 'peg_placement'
    _touch()
  }

  function revealHint() {
    const t = session.value.turn
    if (!t) return
    if (!useJoker('reveal_hint')) return
    t.hint_revealed = true
  }

  function activateDoubleDown() {
    const t = session.value.turn
    if (!t) return
    if (!useJoker('double_down')) return
    t.double_down_active = true
  }

  // ─── Session lifecycle ────────────────────────────────────────

  /**
   * Adopt a whole session — resuming a saved game, or, later, applying a
   * snapshot from the host device.
   *
   * The generator is rebuilt at its stored position rather than from the seed,
   * so play continues the sequence instead of re-drawing it.
   */
  function loadSessionState(next: GameSession) {
    session.value = next
    rng.value =
      next.status === 'setup' ? null : new GameRng(next.rng_seed, next.rng_state ?? null)
    currentQuestion.value = null
    setupPhase.value = 'start'
  }

  /**
   * A saved game found at startup, offered on the title screen.
   *
   * Held separately from `session` so the title screen still shows a title
   * screen — the saved game is only adopted once the player says to resume.
   */
  const resumableSession = ref<GameSession | null>(null)

  /** Look for an interrupted game. Called once, at app start. */
  async function checkForResumableGame() {
    try {
      const saved = await loadSession()
      if (saved && saved.status === 'in_progress') resumableSession.value = saved
    } catch (err) {
      console.error('Could not read the saved game:', err)
    }
  }

  function resumeGame() {
    const saved = resumableSession.value
    if (!saved) return
    resumableSession.value = null
    loadSessionState(saved)
  }

  /** Decline the offer and drop the save, per SPEC §9 resume flow. */
  function discardResumableGame() {
    resumableSession.value = null
    deleteSession().catch((err) => console.error('Could not delete the saved game:', err))
  }

  /**
   * Auto-save after every state transition (SPEC §9).
   *
   * Deep, because almost every transition mutates inside the session rather
   * than replacing it. The write itself is debounced 500 ms inside
   * `scheduleAutoSave`, with an immediate flush on backgrounding, so this fires
   * far more often than it writes.
   */
  watch(
    session,
    (current) => {
      if (current.status === 'in_progress') scheduleAutoSave(current)
    },
    { deep: true },
  )

  // Reset for new game
  function resetGame() {
    session.value = createSession()
    setupPhase.value = 'start'
    currentQuestion.value = null
    rng.value = null
    playerIntroLine.value = null
    resumableSession.value = null
    deleteSession().catch(() => {
      /* nothing to drop */
    })
  }

  /**
   * Every action a player can take, as a name-to-handler map.
   *
   * This map *is* the intent vocabulary — `GameIntent` is derived from it below
   * rather than written out a second time, so a new action cannot be added to
   * the game and forgotten on the wire, and its argument types can never drift
   * from the handler's.
   *
   * Only player decisions belong here. Setup navigation, the resume prompt and
   * `resetGame` are device-local: they move one screen around, not the game.
   */
  const INTENT_HANDLERS: GameIntentMap = {
    addPlayer,
    updatePlayerExpertise,
    removePlayer,
    updateSettings,
    startGame,
    proceedFromTurnGate,
    selectSlot,
    proceedFromJokerAward,
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
  } as const

  /**
   * Apply one intent.
   *
   * Offline this is just a function call, which is the point: the same code
   * path serves a tap on this device and, later, an intent relayed from
   * another one. Anything illegal for the current state is refused by
   * `_setState` rather than by the caller.
   */
  function dispatch(intent: GameIntent): unknown {
    const handler = INTENT_HANDLERS[intent.type] as (...args: unknown[]) => unknown
    return handler(...(intent.args as unknown[]))
  }

  return {
    // The whole session — the save format and, later, the sync unit.
    session,

    // The intent vocabulary
    dispatch,

    // State (read-only views onto the session)
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
    pegsEarned,
    awaitingSeat,

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

    // Session lifecycle
    loadSessionState,
    resumableSession,
    checkForResumableGame,
    resumeGame,
    discardResumableGame,
    resetGame,
  }
})
