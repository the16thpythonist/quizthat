import type {
  Board,
  Constraint,
  Difficulty,
  GameSettings,
  OfferedSlot,
  Player,
  PlacementRule,
  QuestionMeta,
  BasicJokerType,
  SpecialJokerType,
} from '../types/session'
import { GameRng } from './rng'
import { BOARD_SIZE } from '../types/session'

// ─── Win Detection ──────────────────────────────────────────────

/**
 * Check if a board has a completed line.
 * Returns the winning line coordinates or null.
 */
export function checkWin(board: Board): [number, number][] | null {
  const n = board.size
  // Check rows
  for (let r = 0; r < n; r++) {
    let allFilled = true
    for (let c = 0; c < n; c++) {
      if (!board.fields[r]?.[c]) { allFilled = false; break }
    }
    if (allFilled) {
      return Array.from({ length: n }, (_, c) => [r, c] as [number, number])
    }
  }
  // Check columns
  for (let c = 0; c < n; c++) {
    let allFilled = true
    for (let r = 0; r < n; r++) {
      if (!board.fields[r]?.[c]) { allFilled = false; break }
    }
    if (allFilled) {
      return Array.from({ length: n }, (_, r) => [r, c] as [number, number])
    }
  }
  // Main diagonal
  {
    let allFilled = true
    for (let i = 0; i < n; i++) {
      if (!board.fields[i]?.[i]) { allFilled = false; break }
    }
    if (allFilled) {
      return Array.from({ length: n }, (_, i) => [i, i] as [number, number])
    }
  }
  // Anti-diagonal
  {
    let allFilled = true
    for (let i = 0; i < n; i++) {
      if (!board.fields[i]?.[n - 1 - i]) { allFilled = false; break }
    }
    if (allFilled) {
      return Array.from({ length: n }, (_, i) => [i, n - 1 - i] as [number, number])
    }
  }
  return null
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

/**
 * Randomly assign 2x boost to 2 of the 4 slot indices.
 */
export function assignBoostSlots(rng: GameRng): number[] {
  const indices = [0, 1, 2, 3]
  return rng.sample(indices, 2)
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

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'very_hard']

/**
 * Pick a difficulty based on the Slot 1 distribution.
 */
export function pickSlot1Difficulty(rng: GameRng): Difficulty {
  return rng.weightedPick(
    ALL_DIFFICULTIES,
    ALL_DIFFICULTIES.map(d => SLOT1_DIFFICULTY_WEIGHTS[d]),
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
  },
): QuestionMeta[] {
  return corpus.filter(q => {
    if (!q.languages.includes(opts.language)) return false
    if (opts.excludeIds.has(q.id)) return false
    if (opts.difficulty && q.difficulty !== opts.difficulty) return false
    if (opts.majorCategory && q.major_category !== opts.majorCategory) return false
    if (opts.subcategory && q.subcategory !== opts.subcategory) return false
    return true
  })
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
): OfferedSlot[] {
  const lang = settings.language
  const boardSize = BOARD_SIZE
  const excludeIds = new Set(usedIds)
  const slots: OfferedSlot[] = []

  // Slot 1: Expertise
  const slot1Difficulty = curseActive ? 'hard' as Difficulty : pickSlot1Difficulty(rng)
  const slot1Question = pickExpertiseQuestion(rng, corpus, player, lang, slot1Difficulty, excludeIds)
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
    })
  }

  // Slots 2 & 3: Standard with constraints (one row, one column)
  const [constraint2, constraint3] = generateSlot23Constraints(rng, boardSize)
  const slot23Constraints = [constraint2, constraint3]
  for (let slotIdx = 1; slotIdx <= 2; slotIdx++) {
    const difficulty = curseActive ? 'hard' as Difficulty : pickUniformDifficulty(rng)
    const constraint = slot23Constraints[slotIdx - 1]!

    const candidates = filterQuestions(corpus, { language: lang, difficulty, excludeIds })
    const question = candidates.length > 0 ? rng.pick(candidates) : null
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
      })
    }
  }

  // Slot 4: Hard/Very Hard (fall back to the other if no questions match)
  const slot4Difficulty = pickSlot4Difficulty(rng)
  let slot4Candidates = filterQuestions(corpus, { language: lang, difficulty: slot4Difficulty, excludeIds })
  if (slot4Candidates.length === 0) {
    const fallback: Difficulty = slot4Difficulty === 'very_hard' ? 'hard' : 'very_hard'
    slot4Candidates = filterQuestions(corpus, { language: lang, difficulty: fallback, excludeIds })
  }
  const slot4Question = slot4Candidates.length > 0 ? rng.pick(slot4Candidates) : null
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
    })
  }

  return slots
}

/**
 * Pick a question from the player's expertise areas.
 * 60% chance subcategory, 40% chance major category.
 */
function pickExpertiseQuestion(
  rng: GameRng,
  corpus: QuestionMeta[],
  player: Player,
  language: string,
  difficulty: Difficulty,
  excludeIds: Set<string>,
): QuestionMeta | null {
  const useSubcategory = rng.chance(0.6)

  if (useSubcategory && player.expertise.subcategories.length > 0) {
    const sub = rng.pick(player.expertise.subcategories)
    const candidates = filterQuestions(corpus, {
      language,
      difficulty,
      subcategory: sub,
      excludeIds,
    })
    if (candidates.length > 0) return rng.pick(candidates)
  }

  // Fall back to major category
  if (player.expertise.major_categories.length > 0) {
    const major = rng.pick(player.expertise.major_categories)
    const candidates = filterQuestions(corpus, {
      language,
      difficulty,
      majorCategory: major,
      excludeIds,
    })
    if (candidates.length > 0) return rng.pick(candidates)
  }

  // Final fallback: any category
  const candidates = filterQuestions(corpus, { language, difficulty, excludeIds })
  if (candidates.length > 0) return rng.pick(candidates)

  return null
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
    }
  } else if (slot.slot_type === 'standard' && slot.constraint) {
    // Slots 2/3: constrained to row/column
    return {
      type: 'constrained',
      constraint: slot.constraint,
      candidates_count: settings.placement_candidates,
    }
  } else {
    // Slot 1 (expertise): random on entire board
    return {
      type: 'random_board',
      constraint: null,
      candidates_count: settings.placement_candidates,
    }
  }
}

/**
 * Placement rule for pass correct (Slot 1 rules — random on entire board).
 */
export function passPlacementRule(settings: GameSettings): PlacementRule {
  return {
    type: 'random_board',
    constraint: null,
    candidates_count: settings.placement_candidates,
  }
}

/**
 * Placement rule for Gambler correct (Slot 1 rules — random on entire board).
 */
export function gamblerPlacementRule(settings: GameSettings): PlacementRule {
  return {
    type: 'random_board',
    constraint: null,
    candidates_count: settings.placement_candidates,
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
