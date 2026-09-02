import type {
  Board,
  Constraint,
  Difficulty,
  GameSettings,
  OfferedSlot,
  Player,
  PlacementRule,
  QuestionMeta,
  PlayerColor,
  BasicJokerType,
  SpecialJokerType,
} from '../types/session'
import { GameRng } from './rng'
import { BOARD_SIZE, BATTLE_QUESTION_TYPES } from '../types/session'

// ─── Win Detection ──────────────────────────────────────────────

/**
 * Every completed line on a board — rows, columns, both diagonals.
 *
 * Returned in a stable order so a line keeps its identity between calls, which
 * matters because completed lines stay highlighted while play continues.
 */
export function findCompletedLines(board: Board): [number, number][][] {
  const n = board.size
  const lines: [number, number][][] = []

  for (let r = 0; r < n; r++) {
    let all = true
    for (let c = 0; c < n; c++) {
      if (!board.fields[r]?.[c]) { all = false; break }
    }
    if (all) lines.push(Array.from({ length: n }, (_, c) => [r, c] as [number, number]))
  }

  for (let c = 0; c < n; c++) {
    let all = true
    for (let r = 0; r < n; r++) {
      if (!board.fields[r]?.[c]) { all = false; break }
    }
    if (all) lines.push(Array.from({ length: n }, (_, r) => [r, c] as [number, number]))
  }

  {
    let all = true
    for (let i = 0; i < n; i++) {
      if (!board.fields[i]?.[i]) { all = false; break }
    }
    if (all) lines.push(Array.from({ length: n }, (_, i) => [i, i] as [number, number]))
  }

  {
    let all = true
    for (let i = 0; i < n; i++) {
      if (!board.fields[i]?.[n - 1 - i]) { all = false; break }
    }
    if (all) lines.push(Array.from({ length: n }, (_, i) => [i, n - 1 - i] as [number, number]))
  }

  return lines
}

/**
 * Check whether a board has won.
 *
 * Returns the completed lines once there are at least `linesToWin` of them, or
 * null. Lines may cross: a row and a column that intersect count as two, so on
 * a 4x4 seven pegs can already be a two-line win.
 */
export function checkWin(board: Board, linesToWin = 1): [number, number][][] | null {
  const lines = findCompletedLines(board)
  return lines.length >= linesToWin ? lines : null
}

// ─── 2x Boost Eligibility ───────────────────────────────────────

/**
 * A player is eligible for the 2x boost if round >= 3 and they have
 * the fewest questions_correct among all players (ties included).
 */
export function isBoostEligible(round: number, players: Player[], playerIndex: number): boolean {
  if (round < 3) return false
  const playerCorrect = players[playerIndex]?.stats.questions_correct ?? 0
  const minCorrect = Math.min(...players.map(p => p.stats.questions_correct))
  return playerCorrect === minCorrect
}

/** Per-card chance of a 2x boost for any player, in any round. */
export const BOOST_CHANCE_BASE = 0.08
/** Raised chance for the trailing player from round 3 — the catch-up path. */
export const BOOST_CHANCE_BEHIND = 0.35
/** Per-card chance that a standard slot (2 or 3) also awards a joker. */
export const JOKER_CHANCE_STANDARD = 0.35

/**
 * Assign the 2x boost per card rather than to a fixed number of slots.
 *
 * Everyone has a small chance, so a 2x can surprise anyone, and the trailing
 * player's chance is raised sharply from round 3 — that raised rate is what
 * carries the catch-up mechanic.
 *
 * Never the expertise slot: like the joker chip, a sweetener there would
 * reward the safe pick, when the whole point of both is to tempt a player off
 * it.
 */
export function assignBoostSlots(rng: GameRng, behind: boolean): number[] {
  const chance = behind ? BOOST_CHANCE_BEHIND : BOOST_CHANCE_BASE
  return [1, 2, 3].filter(() => rng.chance(chance))
}

/**
 * Assign which slots award a joker.
 *
 * Slot 4 always does. The two standard slots may, which is the point: a joker
 * dangling on a risky card is what tempts a player away from their safe
 * expertise pick. The expertise slot itself never carries one, so the lure
 * always costs something.
 */
export function assignJokerSlots(rng: GameRng): number[] {
  const slots = [3]
  if (rng.chance(JOKER_CHANCE_STANDARD)) slots.push(1)
  if (rng.chance(JOKER_CHANCE_STANDARD)) slots.push(2)
  return slots.sort((a, b) => a - b)
}

// ─── Previous Round Player Resolution ───────────────────────────

export function previousRoundPlayer(
  round: number,
  currentPlayerIndex: number,
  playerCount: number,
): number | null {
  if (round === 1 && currentPlayerIndex === 0) return null
  return (currentPlayerIndex - 1 + playerCount) % playerCount
}

// ─── Peg Placement ──────────────────────────────────────────────

/** Get all empty fields on a board. */
export function getEmptyFields(board: Board): [number, number][] {
  const fields: [number, number][] = []
  for (let r = 0; r < board.size; r++) {
    for (let c = 0; c < board.size; c++) {
      if (!board.fields[r]?.[c]) {
        fields.push([r, c])
      }
    }
  }
  return fields
}

/** Get empty fields within a specific row, column, or row+column cross. */
export function getConstrainedEmptyFields(
  board: Board,
  constraint: Constraint,
): [number, number][] {
  const fields: [number, number][] = []
  if (constraint.type === 'row') {
    for (let c = 0; c < board.size; c++) {
      if (!board.fields[constraint.index]?.[c]) {
        fields.push([constraint.index, c])
      }
    }
  } else if (constraint.type === 'column') {
    for (let r = 0; r < board.size; r++) {
      if (!board.fields[r]?.[constraint.index]) {
        fields.push([r, constraint.index])
      }
    }
  } else if (constraint.type === 'row_column') {
    const ri = constraint.row_index!
    const ci = constraint.col_index!
    // All empty fields in the row
    for (let c = 0; c < board.size; c++) {
      if (!board.fields[ri]?.[c]) {
        fields.push([ri, c])
      }
    }
    // All empty fields in the column (skip intersection to avoid duplicates)
    for (let r = 0; r < board.size; r++) {
      if (r !== ri && !board.fields[r]?.[ci]) {
        fields.push([r, ci])
      }
    }
  }
  return fields
}

/**
 * Generate candidate fields for peg placement.
 * Returns N random candidates from the eligible fields.
 */
export function generateCandidates(
  rng: GameRng,
  board: Board,
  rule: PlacementRule,
): [number, number][] {
  let eligible: [number, number][]
  if (rule.type === 'free') {
    eligible = getEmptyFields(board)
    return eligible // all empty fields for free placement
  } else if (rule.type === 'constrained' && rule.constraint) {
    eligible = getConstrainedEmptyFields(board, rule.constraint)
  } else {
    eligible = getEmptyFields(board)
  }
  if (eligible.length <= rule.candidates_count) {
    return eligible
  }
  return rng.sample(eligible, rule.candidates_count)
}

// ─── Peg Count Calculation ──────────────────────────────────────

/**
 * Calculate total pegs awarded for a correct answer.
 * Gambler always awards 3 pegs (handled separately).
 */
export function calculatePegCount(
  has2xBoost: boolean,
  doubleDownActive: boolean,
): number {
  let pegs = 1 // base
  if (has2xBoost) pegs++
  if (doubleDownActive) pegs++
  return pegs
}

// ─── Starting Peg Algorithm ─────────────────────────────────────

/**
 * Generate a starting peg pattern.
 * Constraint: no line (row, column, diagonal) has more than floor(N/2) pegs.
 * The same pattern is used for all players.
 */
export function generateStartingPegs(
  rng: GameRng,
  boardSize: number,
  count: number,
): [number, number][] {
  if (count === 0) return []
  const maxPerLine = Math.floor(boardSize / 2)

  // Try up to 1000 times to find a valid pattern
  for (let attempt = 0; attempt < 1000; attempt++) {
    const allPositions: [number, number][] = []
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        allPositions.push([r, c])
      }
    }
    const selected = rng.sample(allPositions, count)
    if (isValidStartingPattern(selected, boardSize, maxPerLine)) {
      return selected
    }
  }

  // Fallback: return empty (should never happen for reasonable inputs)
  return []
}

function isValidStartingPattern(
  positions: [number, number][],
  boardSize: number,
  maxPerLine: number,
): boolean {
  // Check rows
  for (let r = 0; r < boardSize; r++) {
    if (positions.filter(([pr]) => pr === r).length > maxPerLine) return false
  }
  // Check columns
  for (let c = 0; c < boardSize; c++) {
    if (positions.filter(([, pc]) => pc === c).length > maxPerLine) return false
  }
  // Main diagonal
  if (positions.filter(([r, c]) => r === c).length > maxPerLine) return false
  // Anti-diagonal
  if (positions.filter(([r, c]) => r + c === boardSize - 1).length > maxPerLine) return false

  return true
}

/**
 * Apply a starting peg pattern to a board.
 */
export function applyStartingPegs(board: Board, pattern: [number, number][]): void {
  for (const [r, c] of pattern) {
    const row = board.fields[r]
    if (row) {
      row[c] = true
      board.peg_count++
    }
  }
}

// ─── Question Selection (Slot Generation) ───────────────────────

/** Difficulty distribution for Slot 1 (expertise). */
const SLOT1_DIFFICULTY_WEIGHTS: Record<Difficulty, number> = {
  easy: 35,
  medium: 35,
  hard: 20,
  very_hard: 10,
}

/**
 * Slot 1 distribution when the pick came from a specific subcategory.
 *
 * Easy is impossible: a narrow expertise is paid for with harder questions.
 * Claiming you know Physics should not hand you the same gentle questions as
 * claiming you know Science.
 */
const SLOT1_SPECIFIC_DIFFICULTY_WEIGHTS: Record<Difficulty, number> = {
  easy: 0,
  medium: 25,
  hard: 45,
  very_hard: 30,
}

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'very_hard']

/**
 * Pick a difficulty for Slot 1.
 *
 * `specific` shifts to the harsher band used when the question is drawn from
 * one of the player's subcategories rather than a whole major category.
 */
export function pickSlot1Difficulty(rng: GameRng, specific = false): Difficulty {
  const weights = specific ? SLOT1_SPECIFIC_DIFFICULTY_WEIGHTS : SLOT1_DIFFICULTY_WEIGHTS
  return rng.weightedPick(
    ALL_DIFFICULTIES,
    ALL_DIFFICULTIES.map(d => weights[d]),
  )
}

/**
 * Pick a difficulty for Slots 2/3 (uniform random).
 */
export function pickUniformDifficulty(rng: GameRng): Difficulty {
  return rng.pick(ALL_DIFFICULTIES)
}

/**
 * Pick a difficulty for Slot 4 (50/50 Hard/Very Hard).
 */
export function pickSlot4Difficulty(rng: GameRng): Difficulty {
  return rng.chance(0.5) ? 'hard' : 'very_hard'
}

/**
 * Generate a pair of constraints for Slots 2 & 3.
 * Each slot gets both a row and a column (cross-shaped placement region).
 */
export function generateSlot23Constraints(
  rng: GameRng,
  boardSize: number,
): [Constraint, Constraint] {
  const colLabels = 'ABCDEFGHIJ'

  const row1 = rng.int(0, boardSize - 1)
  const col1 = rng.int(0, boardSize - 1)
  const row2 = rng.int(0, boardSize - 1)
  const col2 = rng.int(0, boardSize - 1)

  const constraint1: Constraint = {
    type: 'row_column',
    index: 0,
    row_index: row1,
    col_index: col1,
    display: `Row ${row1 + 1} · Col ${colLabels[col1] ?? String(col1)}`,
  }
  const constraint2: Constraint = {
    type: 'row_column',
    index: 0,
    row_index: row2,
    col_index: col2,
    display: `Row ${row2 + 1} · Col ${colLabels[col2] ?? String(col2)}`,
  }

  return [constraint1, constraint2]
}

/**
 * Filter questions from the corpus index that match criteria.
 */
export function filterQuestions(
  corpus: QuestionMeta[],
  opts: {
    language: string
    difficulty?: Difficulty
    majorCategory?: string
    subcategory?: string
    excludeIds: Set<string>
    /** Opt in to battle-only questions; ordinary turns never see them. */
    battleOnly?: boolean
  },
): QuestionMeta[] {
  return corpus.filter(q => {
    if (!q.languages.includes(opts.language)) return false
    // A value to be estimated cannot be posed as a turn question, so battle
    // types are excluded unless explicitly asked for.
    const isBattle = BATTLE_QUESTION_TYPES.includes(q.question_type)
    if (isBattle !== Boolean(opts.battleOnly)) return false
    if (opts.excludeIds.has(q.id)) return false
    if (opts.difficulty && q.difficulty !== opts.difficulty) return false
    if (opts.majorCategory && q.major_category !== opts.majorCategory) return false
    if (opts.subcategory && q.subcategory !== opts.subcategory) return false
    return true
  })
}

/**
 * Pick a question for a slot, widening the search rather than coming back
 * empty-handed.
 *
 * A slot used to be dropped whenever its drawn difficulty had no match, and the
 * player was simply offered fewer than four cards. That is easy to hit: the
 * corpus is small and unevenly spread — at the time of writing it holds no
 * very_hard questions at all — so any slot that rolled very_hard vanished.
 *
 * Order of preference: the difficulties the slot asked for, then anything else
 * in the language, and only as a last resort a question already seen this game.
 * Repeating a question is a lesser evil than showing a missing card.
 */
function pickForSlot(
  rng: GameRng,
  corpus: QuestionMeta[],
  language: string,
  preferred: Difficulty[],
  excludeIds: Set<string>,
): QuestionMeta | null {
  for (const difficulty of preferred) {
    const candidates = filterQuestions(corpus, { language, difficulty, excludeIds })
    if (candidates.length > 0) return rng.pick(candidates)
  }

  const anyDifficulty = filterQuestions(corpus, { language, excludeIds })
  if (anyDifficulty.length > 0) return rng.pick(anyDifficulty)

  const repeat = filterQuestions(corpus, { language, excludeIds: new Set<string>() })
  return repeat.length > 0 ? rng.pick(repeat) : null
}

/** The drawn difficulty first, then the rest as fallbacks. */
function difficultyOrder(first: Difficulty): Difficulty[] {
  return [first, ...ALL_DIFFICULTIES.filter((d) => d !== first)]
}

/**
 * Generate 4 question slots for a turn.
 * Slot 1: Expertise (player's categories)
 * Slots 2/3: Random category, with board constraints
 * Slot 4: Hard/Very Hard, random category
 */
export function generateSlots(
  rng: GameRng,
  corpus: QuestionMeta[],
  player: Player,
  settings: GameSettings,
  usedIds: Set<string>,
  curseActive: boolean,
  boostSlots: number[],
  jokerSlots: number[],
): OfferedSlot[] {
  const lang = settings.language
  const boardSize = BOARD_SIZE
  const excludeIds = new Set(usedIds)
  const slots: OfferedSlot[] = []

  // Slot 1: Expertise. The difficulty band depends on which tier of the
  // player's expertise the question ends up being drawn from, so the picker
  // decides it rather than the caller.
  const slot1Pick = pickExpertiseQuestion(rng, corpus, player, lang, curseActive, excludeIds)
  const slot1Question = slot1Pick?.question ?? null
  if (slot1Question) {
    excludeIds.add(slot1Question.id)
    slots.push({
      slot_type: 'expertise',
      question_id: slot1Question.id,
      teaser_title: '', // loaded when question is selected
      major_category: slot1Question.major_category,
      difficulty: slot1Question.difficulty,
      constraint: null,
      has_2x_boost: boostSlots.includes(0),
      awards_joker: jokerSlots.includes(0),
    })
  }

  // Slots 2 & 3: Standard with constraints (one row, one column)
  const [constraint2, constraint3] = generateSlot23Constraints(rng, boardSize)
  const slot23Constraints = [constraint2, constraint3]
  for (let slotIdx = 1; slotIdx <= 2; slotIdx++) {
    const difficulty = curseActive ? 'hard' as Difficulty : pickUniformDifficulty(rng)
    const constraint = slot23Constraints[slotIdx - 1]!

    const question = pickForSlot(rng, corpus, lang, difficultyOrder(difficulty), excludeIds)
    if (question) {
      excludeIds.add(question.id)
      slots.push({
        slot_type: 'standard',
        question_id: question.id,
        teaser_title: '',
        major_category: question.major_category,
        difficulty: question.difficulty,
        constraint,
        has_2x_boost: boostSlots.includes(slotIdx),
        awards_joker: jokerSlots.includes(slotIdx),
      })
    }
  }

  // Slot 4: Hard/Very Hard (fall back to the other if no questions match)
  const slot4Difficulty = pickSlot4Difficulty(rng)
  const slot4Other: Difficulty = slot4Difficulty === 'very_hard' ? 'hard' : 'very_hard'
  const slot4Question = pickForSlot(
    rng,
    corpus,
    lang,
    // both hard tiers first — an easy question here is a last resort, not a choice
    [slot4Difficulty, slot4Other],
    excludeIds,
  )
  if (slot4Question) {
    excludeIds.add(slot4Question.id)
    slots.push({
      slot_type: 'hard',
      question_id: slot4Question.id,
      teaser_title: '',
      major_category: slot4Question.major_category,
      difficulty: slot4Question.difficulty,
      constraint: null,
      has_2x_boost: boostSlots.includes(3),
      awards_joker: jokerSlots.includes(3),
    })
  }

  return slots
}

export interface ExpertisePick {
  question: QuestionMeta
  difficulty: Difficulty
  /** true when it came from a subcategory, i.e. the harsher band applied */
  specific: boolean
}

/**
 * Pick a question from the player's expertise areas.
 *
 * Rolls 60/40 for the specific tier (a subcategory) over the generic one (a
 * whole major category), then draws the difficulty from the band that tier
 * deserves — so a player who claims a narrow expertise never sees an easy
 * question from it, while their generic pick still can. A player holding both
 * therefore gets a different bargain depending on which one comes up.
 */
function pickExpertiseQuestion(
  rng: GameRng,
  corpus: QuestionMeta[],
  player: Player,
  language: string,
  curseActive: boolean,
  excludeIds: Set<string>,
): ExpertisePick | null {
  const subs = player.expertise.subcategories
  const majors = player.expertise.major_categories

  const preferSpecific = subs.length > 0 && rng.chance(0.6)
  const order: boolean[] = preferSpecific ? [true, false] : [false, true]

  for (const specific of order) {
    const pool = specific ? subs : majors
    if (pool.length === 0) continue
    const key = rng.pick(pool)
    const difficulty = curseActive ? ('hard' as Difficulty) : pickSlot1Difficulty(rng, specific)
    const candidates = filterQuestions(corpus, {
      language,
      difficulty,
      excludeIds,
      ...(specific ? { subcategory: key } : { majorCategory: key }),
    })
    if (candidates.length > 0) return { question: rng.pick(candidates), difficulty, specific }
  }

  // Final fallback: any category, on the generic band — the player has no
  // expertise, or nothing in it matched, so there is nothing to charge them for.
  // Widened like the other slots so the card is never simply missing.
  const difficulty = curseActive ? ('hard' as Difficulty) : pickSlot1Difficulty(rng, false)
  const question = pickForSlot(rng, corpus, language, difficultyOrder(difficulty), excludeIds)
  return question ? { question, difficulty, specific: false } : null
}

// ─── Basic Joker Re-Earning ─────────────────────────────────────

const BASIC_JOKER_REEARN_CHANCE = 0.12 // ~12%
const BASIC_JOKERS: BasicJokerType[] = [
  'reshuffle_selection',
  'reshuffle_question',
  'reveal_hint',
  'the_gambler',
]

/**
 * Roll for basic joker re-earning on Slot 1/2/3 correct answer.
 * Returns the joker type earned, or null.
 */
export function rollBasicJokerReEarn(rng: GameRng): BasicJokerType | null {
  if (!rng.chance(BASIC_JOKER_REEARN_CHANCE)) return null
  return rng.pick(BASIC_JOKERS)
}

// ─── Special Joker Award ────────────────────────────────────────

const SPECIAL_JOKERS: SpecialJokerType[] = ['steal', 'curse', 'snipe', 'double_down']

/**
 * Award a random special joker from Slot 4 correct.
 * Cap: max 1 per type. Re-roll if already held. No award if all 4 held.
 */
export function awardSpecialJoker(
  rng: GameRng,
  player: Player,
): SpecialJokerType | null {
  const available = SPECIAL_JOKERS.filter(j => player.jokers[j] < 1)
  if (available.length === 0) return null
  return rng.pick(available)
}

// ─── Scramble Answer Order ──────────────────────────────────────

/**
 * Generate a scrambled permutation of answer indices for the pass mechanic.
 */
export function scrambleAnswerOrder(rng: GameRng, count: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i)
  return rng.shuffle(indices)
}

// ─── Placement Rule from Slot ───────────────────────────────────

export function placementRuleForSlot(
  slot: OfferedSlot,
  settings: GameSettings,
): PlacementRule {
  if (slot.slot_type === 'hard') {
    // Slot 4: free placement
    return {
      type: 'free',
      constraint: null,
      candidates_count: 0, // not used for free
      mode: 'choose',
    }
  } else if (slot.slot_type === 'standard' && slot.constraint) {
    // Slots 2/3: constrained to row/column
    return {
      type: 'constrained',
      constraint: slot.constraint,
      candidates_count: settings.placement_candidates,
      // one candidate is no choice at all — IDEA.md calls that automatic
      mode: settings.placement_candidates === 1 ? 'auto' : 'choose',
    }
  } else {
    // Slot 1 (expertise): random on entire board
    return {
      type: 'random_board',
      constraint: null,
      candidates_count: settings.placement_candidates,
      mode: settings.placement_candidates === 1 ? 'auto' : 'choose',
    }
  }
}

/**
 * Placement rule for a correct pass answer.
 *
 * Always exactly one candidate, whatever the game's placement setting: the
 * second chance is a consolation, not a turn, so the peg lands where it lands.
 * A count of 1 is the documented way to say "purely random, no player choice"
 * (IDEA.md, Peg Placement Rules).
 */
export function passPlacementRule(_settings: GameSettings): PlacementRule {
  return {
    type: 'random_board',
    constraint: null,
    candidates_count: 1,
    mode: 'auto',
  }
}

/**
 * Placement rule for Gambler correct (Slot 1 rules — random on entire board).
 */
/**
 * The Gambler's winnings: three fields rattle together and all three are taken.
 *
 * Not three separate reveals — the Gambler is one bet with one outcome, so it
 * resolves in one roulette.
 */
export function gamblerPlacementRule(_settings: GameSettings): PlacementRule {
  return {
    type: 'random_board',
    constraint: null,
    candidates_count: 3,
    mode: 'auto',
  }
}

// ─── Board Helpers ──────────────────────────────────────────────

export function createEmptyBoard(size: number): Board {
  return {
    size,
    fields: Array.from({ length: size }, () =>
      Array.from({ length: size }, () => false),
    ),
    peg_count: 0,
  }
}

/** Column label for display (0 -> A, 1 -> B, etc.) */
export function columnLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

/** Row label for display (0 -> 1, 1 -> 2, etc.) */
export function rowLabel(index: number): string {
  return String(index + 1)
}

// ─── Narrator: player-roster callout ────────────────────────────

/** Voice lines that fit any roster size. */
export const GENERIC_PLAYER_INTRO_KEYS = [
  'players_any_1',
  'players_any_2',
  'players_any_3',
  'players_any_4',
] as const

/**
 * How often the roster-size-specific line is used instead of a generic one.
 *
 * Deliberately low. Only ever one specific line is eligible for a given roster,
 * against four generics, so a 50/50 split would mean a two-player group hears
 * "Ist das etwa ein Date?" every other game. At 0.3 the specific line stays a
 * treat rather than becoming the default.
 */
export const SPECIFIC_PLAYER_INTRO_CHANCE = 0.3

/**
 * Pick the narrator line played once the roster is set, as a voice-line key
 * (e.g. 'players_2', 'players_any_3').
 *
 * Seeded, like every other random decision — the same session seed must always
 * replay the same game.
 */
export function pickPlayerIntroLine(rng: GameRng, playerCount: number): string {
  const hasSpecificLine = playerCount >= 2 && playerCount <= 6
  if (hasSpecificLine && rng.chance(SPECIFIC_PLAYER_INTRO_CHANCE)) {
    return `players_${playerCount}`
  }
  return rng.pick(GENERIC_PLAYER_INTRO_KEYS)
}

// ─── Narrator: verdict remark ───────────────────────────────────

/** Remarks after a correct answer, keyed to /voice/verdict_correct_N.<lang>.mp3 */
export const VERDICT_CORRECT_KEYS = [
  'verdict_correct_1',
  'verdict_correct_2',
  'verdict_correct_3',
  'verdict_correct_4',
  'verdict_correct_5',
  'verdict_correct_6',
  'verdict_correct_7',
  'verdict_correct_8',
] as const

/** Remarks after a wrong answer. */
export const VERDICT_WRONG_KEYS = [
  'verdict_wrong_1',
  'verdict_wrong_2',
  'verdict_wrong_3',
  'verdict_wrong_4',
  'verdict_wrong_5',
  'verdict_wrong_6',
  'verdict_wrong_7',
  'verdict_wrong_8',
] as const

/**
 * Pick the narrator's remark for an answer verdict, as a voice-line key.
 *
 * Seeded like every other random decision. This screen is seen more than any
 * other in the game, which is why there are four of each rather than one.
 */
export function pickVerdictRemark(rng: GameRng, correct: boolean): string {
  return rng.pick(correct ? VERDICT_CORRECT_KEYS : VERDICT_WRONG_KEYS)
}

/** Colour-independent victory lines, played after the winner callout. */
export const VICTORY_REMARK_KEYS = [
  'victory_any_1',
  'victory_any_2',
  'victory_any_3',
  'victory_any_4',
  'victory_any_5',
  'victory_any_6',
] as const

/** Pick the follow-up line after the winner is named. Seeded, as ever. */
export function pickVictoryRemark(rng: GameRng): string {
  return rng.pick(VICTORY_REMARK_KEYS)
}

// ─── Narrator: turn and pass transitions ────────────────────────

/** How many phrasings exist per colour for the turn callout. */
export const TURN_LINE_VARIANTS = 3

/**
 * Pick the "your turn" line for a player, as a voice-line key
 * (e.g. 'turn_red_2').
 *
 * This is the most-heard line in the game — once per turn, so dozens of times a
 * session — hence the variants. Seeded, so a replay says the same thing.
 */
export function pickTurnLine(rng: GameRng, colour: PlayerColor): string {
  return `turn_${colour}_${rng.int(1, TURN_LINE_VARIANTS)}`
}

/** The "your chance" line when a wrong answer passes to the previous player. */
export function passLine(colour: PlayerColor): string {
  return `pass_${colour}`
}
