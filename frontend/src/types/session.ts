import type { GameRngState } from '../engine/rng'

export type { GameRngState }

/** Game state enum — drives screen rendering via the state machine. */
export type GameState =
  | 'setup'
  | 'turn_start'
  | 'selection'
  | 'gambler_confirm'
  | 'gambler_question'
  | 'gambler_resolve'
  | 'joker_award'
  | 'question_display'
  | 'answer_correct'
  | 'answer_wrong'
  | 'battle_intro'
  | 'battle_gate'
  | 'battle_answering'
  | 'battle_reveal'
  | 'pass_gate'
  | 'pass_answering'
  | 'pass_resolve'
  | 'peg_placement'
  | 'win_check'
  | 'victory'
  | 'turn_end'

/**
 * The board is always 4x4. It was configurable (3x3/4x4/5x5) early on, but a
 * fixed grid keeps the win condition, the placement constraints and the
 * difficulty of a line comparable between games. Game length is varied through
 * `starting_pegs` instead.
 */
export const BOARD_SIZE = 4
export type Difficulty = 'easy' | 'medium' | 'hard' | 'very_hard'
export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange'
export type QuestionType =
  | 'multiple_choice'
  | 'sorting'
  | 'map_location'
  | 'calculation'
  /** Battle-only. Never offered as an ordinary turn question. */
  | 'estimation'
  | 'battle_map'

/** Types that only appear in the battle at the end of a round. */
export const BATTLE_QUESTION_TYPES: QuestionType[] = ['estimation', 'battle_map']
export type SlotType = 'expertise' | 'standard' | 'hard'
export type BasicJokerType =
  | 'reshuffle_selection'
  | 'reshuffle_question'
  | 'reveal_hint'
  | 'the_gambler'

export type SpecialJokerType = 'duel' | 'curse' | 'snipe' | 'double_down'

export type JokerType = BasicJokerType | SpecialJokerType

export type SessionStatus = 'setup' | 'in_progress' | 'finished'

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange']

export const COLOR_HEX: Record<PlayerColor, string> = {
  red: '#EF4444',
  blue: '#3B82F6',
  green: '#22C55E',
  yellow: '#EAB308',
  purple: '#A855F7',
  orange: '#F97316',
}

export const COLOR_BG: Record<PlayerColor, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
}

export const COLOR_BG_DARK: Record<PlayerColor, string> = {
  red: 'bg-red-600',
  blue: 'bg-blue-600',
  green: 'bg-green-600',
  yellow: 'bg-yellow-600',
  purple: 'bg-purple-600',
  orange: 'bg-orange-600',
}

export interface Expertise {
  major_categories: string[]
  subcategories: string[]
}

export interface Board {
  size: number
  fields: boolean[][]
  peg_count: number
}

export interface JokerInventory {
  reshuffle_selection: number
  reshuffle_question: number
  reveal_hint: number
  the_gambler: number
  duel: number
  curse: number
  snipe: number
  double_down: number
}

export interface PlayerStats {
  questions_attempted: number
  questions_correct: number
  passes_received: number
  passes_correct: number
  jokers_used: number
  pegs_stolen_from: number
}

export interface Player {
  index: number
  name: string
  color: PlayerColor
  expertise: Expertise
  board: Board
  jokers: JokerInventory
  stats: PlayerStats
  is_cursed: boolean
}

export interface Constraint {
  type: 'row' | 'column' | 'row_column'
  index: number
  row_index?: number
  col_index?: number
  display: string
}

export interface OfferedSlot {
  slot_type: SlotType
  question_id: string
  teaser_title: string
  major_category: string
  difficulty: Difficulty
  constraint: Constraint | null
  has_2x_boost: boolean
  /** Selecting this slot awards a joker outright, before the question is answered. */
  awards_joker: boolean
}

export interface PlacementRule {
  type: 'random_board' | 'constrained' | 'free'
  constraint: Constraint | null
  candidates_count: number
  /**
   * What happens once the reveal settles.
   *
   * 'choose' — the revealed fields are offered and the player taps one.
   * 'auto'   — every revealed field is taken, no tap. Used where the player has
   *            no say: a single candidate, and the Gambler's three pegs, which
   *            rattle together and then all land.
   */
  mode: 'choose' | 'auto'
}

export interface PassState {
  pass_player_index: number
  original_answer_index: number
  scrambled_order: number[]
  result: 'correct' | 'wrong' | 'declined' | null
}

/** One player's answer in a battle, and how far off it was. */
export interface BattleAnswer {
  player_index: number
  /** Estimation: the number typed. Map: the pin, as [lat, lng]. */
  value: number | [number, number]
  /** Absolute difference, or great-circle distance in km. Lower is better. */
  distance: number
}

export interface BattleState {
  question_id: string
  /**
   * Set when this is a Duel joker rather than the battle that closes a round.
   * A duel is between two players only, the transfer happens exclusively when
   * the challenger wins, and play returns to their selection screen afterwards.
   */
  challenger_index: number | null
  question_type: 'estimation' | 'battle_map'
  /** Turn order for this battle; the device passes down this list. */
  order: number[]
  answers: BattleAnswer[]
  /** Set at the reveal; null when a tie or an empty board cancelled it. */
  transfer: { from: number; to: number; field: [number, number] } | null
  winner_index: number | null
  loser_index: number | null
}

export interface TurnState {
  active_player_index: number
  previous_round_player_index: number | null
  phase: GameState
  offered_slots: OfferedSlot[]
  selected_slot_index: number | null
  selected_question_id: string | null
  boosted_slot_indices: number[]
  curse_active: boolean
  double_down_active: boolean
  hint_revealed: boolean
  jokers_used_this_turn: Set<JokerType>
  pegs_remaining: number
  placement_rule: PlacementRule | null
  placing_player_index: number
  gambler_staked_field: [number, number] | null
  pass: PassState | null
  special_joker_earned: SpecialJokerType | null
  basic_joker_earned: BasicJokerType | null
  candidate_fields: [number, number][]
  /**
   * Which order the current question's answer options are shown in, as indices
   * into the question's own options array. Display-only: the stored question is
   * never modified, so correctness is still checked against the real index.
   */
  answer_order: number[]
  /** The joker just handed out by a chipped slot, for the award screen. */
  joker_awarded: JokerType | null
  /** Outcome of this turn's Gambler, for its resolve screen. */
  gambler_won: boolean
}

/**
 * Narrator voice-line keys for this session.
 *
 * Keys only — the store stays free of audio concerns; App.vue and the screens
 * play them. Every one is drawn off the session RNG at the moment the line is
 * decided, so replaying a seed says the same things in the same order.
 */
export interface SessionNarration {
  verdict_remark: string | null
  victory_remark: string | null
  turn_line: string | null
  battle_intro: string | null
  battle_reveal: string | null
}

export interface GameSettings {
  placement_candidates: number
  starting_pegs: number
  /** How many completed lines a player needs to win. Lines may cross. */
  lines_to_win: number
  language: string
}

export interface TurnHistory {
  turn_number: number
  round: number
  player_index: number
  slot_selected: number
  question_id: string
  answer_correct: boolean
  jokers_used: JokerType[]
  pegs_placed: [number, number][]
  pegs_placed_by: number
  pass_occurred: boolean
  pass_result: 'correct' | 'wrong' | 'declined' | null
  special_joker_earned: SpecialJokerType | null
  basic_joker_earned: BasicJokerType | null
  /** A duel joker played this turn: who was challenged and what it won. */
  duel_result: { opponent_index: number; won: boolean; field: [number, number] | null } | null
  snipe_target: { player_index: number; field: [number, number] } | null
  curse_target: number | null
}

/**
 * The complete state of one game.
 *
 * This is the save format (SPEC §9) and, in multi-device play, the unit of
 * synchronisation: the host serializes it after every transition and the
 * server relays it. Anything that must survive a reload or reach another
 * device belongs here.
 *
 * Deliberately *not* in here: `setupPhase` (pre-game navigation, not game
 * state), `currentQuestion` (corpus payload, re-fetchable from
 * `turn.selected_question_id`), and the `GameRng` instance itself — only its
 * `rng_seed` is stored, and the generator is rebuilt from it.
 */
export interface GameSession {
  id: string
  status: SessionStatus
  settings: GameSettings
  players: Player[]
  current_player_index: number
  round: number
  state: GameState
  turn: TurnState | null
  /** The battle closing the current round, a duel, or null between them. */
  battle: BattleState | null
  winner_player_index: number | null
  used_question_ids: Set<string>
  history: TurnHistory[]
  narration: SessionNarration
  created_at: string
  updated_at: string
  rng_seed: number
  /**
   * The generator's position in its sequence. Stored alongside the seed because
   * reseeding alone rewinds, so a resumed game would re-draw what it had spent.
   * Null before the game starts.
   */
  rng_state: GameRngState | null
  /**
   * Every line the winner completed. Plural because `lines_to_win` can require
   * more than one, and a single placement can complete two at once.
   */
  winning_lines: [number, number][][] | null
}

/** Question data loaded from corpus */
export interface MultipleChoiceAnswerData {
  options: string[]
  correct_index: number
}

export interface SortingAnswerData {
  items: string[]
  correct_order: number[]
  metric: string
}

export interface MapLocationAnswerData {
  target: { lat: number; lng: number }
  scoring: { radius_km: number; label: string }[]
}

export interface EstimationAnswerData {
  correct_value: number
  unit: string
}

export interface BattleMapAnswerData {
  target: { lat: number; lng: number }
}

export interface CalculationAnswerData {
  correct_value: number
  tolerance: number
  unit: string
}

export type AnswerData =
  | MultipleChoiceAnswerData
  | SortingAnswerData
  | MapLocationAnswerData
  | CalculationAnswerData

export interface QuestionData {
  teaser_title: string
  question_text: string
  hint: string | null
  answer_data: AnswerData
  question_type: QuestionType
}

/**
 * What a player actually did, as opposed to whether it was right.
 *
 * Screens send one of these; `gradeAnswer` in the engine decides the verdict.
 * Keeping the raw response on the wire is what lets the rules live in one place
 * — a screen that reported a bare boolean would be asserting its own correctness,
 * which a remote client must never be trusted to do.
 */
export type AnswerResponse =
  | { type: 'multiple_choice'; index: number }
  | { type: 'sorting'; order: number[] }
  | { type: 'calculation'; value: number }
  | { type: 'map_location'; point: [number, number] }

/** meta.json from a question folder in the corpus */
export interface QuestionMeta {
  id: string
  languages: string[]
  major_category: string
  subcategory: string
  difficulty: Difficulty
  question_type: QuestionType
  time_limit_seconds: number | null
  version: number
  created_at: string
  generation_batch: string | null
}

/** Cross-session depletion tracking (stored at app level, not per session) */
export interface DeviceQuestionHistory {
  seen_questions: Map<string, string> // question_id -> ISO datetime
  total_seen: number
}
