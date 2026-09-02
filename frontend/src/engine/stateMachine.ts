import type { GameState, JokerType } from '../types/session'

/**
 * Valid state transitions. Maps each state to the set of states it can transition to.
 */
const VALID_TRANSITIONS: Record<GameState, GameState[]> = {
  setup: ['turn_start'],
  turn_start: ['selection'],
  battle_intro: ['battle_gate'],
  battle_gate: ['battle_answering'],
  battle_answering: ['battle_gate', 'battle_reveal'],
  battle_reveal: ['turn_start'],
  selection: ['question_display', 'joker_award', 'selection', 'gambler_confirm'],
  joker_award: ['question_display'],
  gambler_confirm: ['gambler_question', 'selection'],
  gambler_question: ['gambler_resolve'],
  gambler_resolve: ['peg_placement', 'turn_end'],
  question_display: ['answer_correct', 'answer_wrong', 'question_display'],
  answer_correct: ['peg_placement'],
  answer_wrong: ['pass_gate', 'turn_end'],
  pass_gate: ['pass_answering'],
  pass_answering: ['pass_resolve'],
  pass_resolve: ['peg_placement', 'turn_end'],
  peg_placement: ['win_check'],
  win_check: ['victory', 'peg_placement', 'turn_end'],
  victory: ['setup'],
  turn_end: ['turn_start'],
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
  selection: ['reshuffle_selection', 'the_gambler', 'steal', 'curse', 'snipe'],
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
