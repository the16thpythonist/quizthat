<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { JokerInventory, JokerType, GameState, PlayerColor } from '../types/session'
import { COLOR_HEX } from '../types/session'

const { t } = useI18n()

const props = defineProps<{
  jokers: JokerInventory
  usedThisTurn: Set<JokerType>
  gameState: GameState
  playerColor?: PlayerColor
}>()

const emit = defineEmits<{
  useJoker: [type: JokerType]
}>()

interface JokerDisplay {
  type: JokerType
  icon: string
  count: number
  usable: boolean
}

const JOKER_ICONS: Record<JokerType, string> = {
  reshuffle_selection: '🔄',
  reshuffle_question: '🔃',
  reveal_hint: '💡',
  the_gambler: '🎲',
  steal: '🫳',
  curse: '💀',
  snipe: '🎯',
  double_down: '⬆️',
}

const SELECTION_JOKERS: JokerType[] = ['reshuffle_selection', 'the_gambler', 'steal', 'curse', 'snipe']
const QUESTION_JOKERS: JokerType[] = ['reshuffle_question', 'reveal_hint', 'double_down']

const ALL_JOKERS: JokerType[] = [
  'reshuffle_selection', 'reshuffle_question', 'reveal_hint', 'the_gambler',
  'steal', 'curse', 'snipe', 'double_down',
]

function isUsableInState(type: JokerType, state: GameState): boolean {
  if (state === 'selection') return SELECTION_JOKERS.includes(type)
  if (state === 'question_display') return QUESTION_JOKERS.includes(type)
  return false
}

const jokerList = computed<JokerDisplay[]>(() => {
  return ALL_JOKERS
    .filter((type) => props.jokers[type] > 0)
    .map((type) => {
      const count = props.jokers[type]
      const usedAlready = props.usedThisTurn.has(type)
      return {
        type,
        icon: JOKER_ICONS[type],
        count,
        usable: !usedAlready && isUsableInState(type, props.gameState),
      }
    })
})

const hasJokers = computed(() => jokerList.value.length > 0)

function handleJokerClick(joker: JokerDisplay) {
  if (joker.usable) {
    emit('useJoker', joker.type)
  }
}
</script>

<template>
  <div
    v-if="hasJokers"
    class="flex items-center justify-center py-3 px-4 rounded-xl mx-auto"
    :style="{
      width: '75%',
      ...(props.playerColor ? {
        background: `${COLOR_HEX[props.playerColor]}15`,
        border: `1px solid ${COLOR_HEX[props.playerColor]}20`,
      } : {
        background: 'rgba(14, 14, 22, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }),
    }"
  >
    <div class="flex items-center justify-center gap-3">
      <button
        v-for="joker in jokerList"
        :key="joker.type"
        class="relative flex items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 touch-manipulation"
        :class="[
          joker.usable ? 'opacity-100 cursor-pointer hover:scale-110' : 'opacity-40 cursor-default',
        ]"
        :style="{
          border: joker.usable
            ? '1px solid rgba(255, 255, 255, 0.12)'
            : '1px solid rgba(255, 255, 255, 0.04)',
        }"
        :title="t('jokerNames.' + joker.type)"
        @click="handleJokerClick(joker)"
      >
        <span class="text-2xl">{{ joker.icon }}</span>
        <span
          v-if="joker.count > 1"
          class="absolute -top-1.5 -right-1.5 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
          :style="{
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            boxShadow: '0 0 8px rgba(99, 102, 241, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3)',
          }"
        >
          {{ joker.count }}
        </span>
      </button>
    </div>
  </div>
</template>
