<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { JokerInventory, JokerType, GameState, PlayerColor } from '../types/session'
import JokerIcon from './JokerIcon.vue'

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
  count: number
  usable: boolean
}

const SELECTION_JOKERS: JokerType[] = ['reshuffle_selection', 'the_gambler', 'duel', 'curse', 'snipe']
const QUESTION_JOKERS: JokerType[] = ['reshuffle_question', 'reveal_hint', 'double_down']

const ALL_JOKERS: JokerType[] = [
  'reshuffle_selection', 'reshuffle_question', 'reveal_hint', 'the_gambler',
  'duel', 'curse', 'snipe', 'double_down',
]

function isUsableInState(type: JokerType, state: GameState): boolean {
  if (state === 'selection') return SELECTION_JOKERS.includes(type)
  if (state === 'question_display') return QUESTION_JOKERS.includes(type)
  return false
}

const jokerList = computed<JokerDisplay[]>(() =>
  ALL_JOKERS
    .filter((type) => props.jokers[type] > 0)
    .map((type) => ({
      type,
      count: props.jokers[type],
      usable: !props.usedThisTurn.has(type) && isUsableInState(type, props.gameState),
    })),
)

const hasJokers = computed(() => jokerList.value.length > 0)

/**
 * Jokers are one-time-use, so tapping one asks before spending it rather than
 * firing immediately. The sheet also carries the explanation, which is why the
 * tray itself needs no labels.
 */
const pending = ref<JokerType | null>(null)

function requestJoker(joker: JokerDisplay) {
  if (!joker.usable) return
  pending.value = joker.type
}

function confirmJoker() {
  if (pending.value) emit('useJoker', pending.value)
  pending.value = null
}

function cancelJoker() {
  pending.value = null
}
</script>

<template>
  <div v-if="hasJokers" class="qt-tray">
    <button
      v-for="joker in jokerList"
      :key="joker.type"
      class="qt-joker"
      :disabled="!joker.usable"
      :title="t('jokerNames.' + joker.type)"
      :aria-label="t('jokerNames.' + joker.type)"
      @click="requestJoker(joker)"
    >
      <JokerIcon :type="joker.type" :size="22" />
      <span v-if="joker.count > 1" class="qt-joker-count">{{ joker.count }}</span>
    </button>
  </div>

  <!-- confirmation, rising from the bottom -->
  <template v-if="pending">
    <div class="qt-backdrop" @click="cancelJoker"></div>
    <div class="qt-sheet qt-sheet--up">
      <div class="qt-joker-hero">
        <JokerIcon :type="pending" :size="30" />
      </div>
      <div class="qt-joker-name">{{ t('jokerNames.' + pending) }}</div>
      <p class="qt-joker-desc">{{ t('jokerDesc.' + pending) }}</p>
      <div class="flex flex-col gap-2.5">
        <button class="qt-cta qt-cta--accent" @click="confirmJoker">{{ t('joker.use') }}</button>
        <button class="qt-cta qt-cta--ghost" @click="cancelJoker">{{ t('joker.cancel') }}</button>
      </div>
    </div>
  </template>
</template>
