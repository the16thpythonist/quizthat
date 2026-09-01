/** Game state enum — drives screen rendering via the state machine. */
export type GameState =
  | 'setup'
  | 'turn_start'
  | 'selection'
  | 'gambler_confirm'
  | 'gambler_question'
  | 'gambler_resolve'
  | 'question_display'
  | 'answer_correct'
  | 'answer_wrong'
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
export type QuestionType = 'multiple_choice' | 'sorting' | 'map_location' | 'calculation'
export type SlotType = 'expertise' | 'standard' | 'hard'
export type BasicJokerType =
  | 'reshuffle_selection'
  | 'reshuffle_question'
  | 'reveal_hint'
  | 'the_gambler'

export type SpecialJokerType = 'steal' | 'curse' | 'snipe' | 'double_down'

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
  steal: number
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
}

export interface PassState {
  pass_player_index: number
  original_answer_index: number
  scrambled_order: number[]
  result: 'correct' | 'wrong' | 'declined' | null
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
}

export interface GameSettings {
  placement_candidates: number
  starting_pegs: number
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
  steal_target: { player_index: number; field: [number, number] } | null
  snipe_target: { player_index: number; field: [number, number] } | null
  curse_target: number | null
}

export interface GameSession {
  id: string
  status: SessionStatus
  settings: GameSettings
  players: Player[]
  current_player_index: number
  round: number
  state: GameState
  turn: TurnState | null
  winner_player_index: number | null
  used_question_ids: Set<string>
  history: TurnHistory[]
  created_at: string
  updated_at: string
  rng_seed: number
  winning_line: [number, number][] | null
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
