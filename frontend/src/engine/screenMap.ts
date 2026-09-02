import { defineAsyncComponent, type Component } from 'vue'
import type { GameState } from '../types/session'

const screenComponents: Record<GameState, Component> = {
  setup: defineAsyncComponent(() => import('../screens/SetupScreen.vue')),
  turn_start: defineAsyncComponent(() => import('../screens/TurnGateScreen.vue')),
  selection: defineAsyncComponent(() => import('../screens/SelectionScreen.vue')),
  gambler_confirm: defineAsyncComponent(() => import('../screens/GamblerConfirmScreen.vue')),
  gambler_question: defineAsyncComponent(() => import('../screens/QuestionScreen.vue')),
  gambler_resolve: defineAsyncComponent(() => import('../screens/GamblerResolveScreen.vue')),
  joker_award: defineAsyncComponent(() => import('../screens/JokerAwardScreen.vue')),
  question_display: defineAsyncComponent(() => import('../screens/QuestionScreen.vue')),
  answer_correct: defineAsyncComponent(() => import('../screens/AnswerResultScreen.vue')),
  answer_wrong: defineAsyncComponent(() => import('../screens/AnswerResultScreen.vue')),
  pass_gate: defineAsyncComponent(() => import('../screens/PassGateScreen.vue')),
  pass_answering: defineAsyncComponent(() => import('../screens/QuestionScreen.vue')),
  pass_resolve: defineAsyncComponent(() => import('../screens/PassResolveScreen.vue')),
  peg_placement: defineAsyncComponent(() => import('../screens/PegPlacementScreen.vue')),
  win_check: defineAsyncComponent(() => import('../screens/PegPlacementScreen.vue')),
  victory: defineAsyncComponent(() => import('../screens/VictoryScreen.vue')),
  turn_end: defineAsyncComponent(() => import('../screens/TurnGateScreen.vue')),
}

export function screenForState(state: GameState): Component {
  return screenComponents[state]
}
