import type { GameState, JokerType } from '../types/session'

/**
 * Valid state transitions. Maps each state to the set of states it can transition to.
 *
 * This is enforced, not merely documentation: the store routes every state
 * change through `_setState`, which rejects anything not listed here. That is
 * what will refuse a malformed or out-of-turn command once intents can arrive
 * from another device.
 *
 * It had drifted badly while nothing consulted it — `peg_placement` led only to
 * `win_check`, a state the store never actually enters, and none of the paths
 * into `turn_end` were listed. The entries below were read back off the store.
 */
const VALID_TRANSITIONS: Record<GameState, GameState[]> = {
  setup: ['turn_start'],
  turn_start: ['selection'],
  battle_intro: ['battle_gate'],
  battle_gate: ['battle_answering'],
  battle_answering: ['battle_gate', 'battle_reveal'],
  // A round battle opens the next turn; a duel hands the challenger back their
  // own selection screen.
  battle_reveal: ['turn_start', 'selection'],
  selection: ['question_display', 'joker_award', 'selection', 'gambler_confirm', 'battle_intro'],
  joker_award: ['question_display'],
  gambler_confirm: ['gambler_question', 'selection'],
  gambler_question: ['gambler_resolve'],
  gambler_resolve: ['peg_placement', 'turn_end'],
  // question_display -> itself is the Reshuffle Question joker.
  question_display: ['answer_correct', 'answer_wrong', 'question_display'],
  answer_correct: ['peg_placement'],
  answer_wrong: ['pass_gate', 'turn_end'],
  pass_gate: ['pass_answering'],
  // A correct pass answer earns its own placement.
  pass_answering: ['pass_resolve', 'peg_placement'],
  pass_resolve: ['turn_end'],
  // -> itself while pegs remain; the win is declared from here directly.
  peg_placement: ['peg_placement', 'victory', 'turn_end'],
  /**
   * Specified in SPEC §8 but never entered: the win is detected inline as each
   * peg lands, so `peg_placement` goes straight to `victory`. Kept so the state
   * enum still matches the spec.
   */
  win_check: ['victory', 'peg_placement', 'turn_end'],
  victory: ['setup'],
  // The battle that closes a round begins the moment the last player's turn ends.
  turn_end: ['turn_start', 'battle_intro'],
}

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: GameState, to: GameState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Jokers legal in each game state.
 */
const JOKERS_BY_STATE: Partial<Record<GameState, JokerType[]>> = {
  selection: ['reshuffle_selection', 'the_gambler', 'duel', 'curse', 'snipe'],
  question_display: ['reshuffle_question', 'reveal_hint', 'double_down'],
}

/**
 * Check if a joker can be used in the current state.
 */
export function isJokerLegalInState(state: GameState, jokerType: JokerType): boolean {
  return JOKERS_BY_STATE[state]?.includes(jokerType) ?? false
}

/**
 * Get all joker types usable in a given state.
 */
export function getLegalJokers(state: GameState): JokerType[] {
  return JOKERS_BY_STATE[state] ?? []
}
