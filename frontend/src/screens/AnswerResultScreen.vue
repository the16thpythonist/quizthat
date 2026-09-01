<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { COLOR_HEX } from '../types/session'

const { t } = useI18n()
const game = useGameStore()

const isCorrect = computed(() => game.state === 'answer_correct')
const player = computed(() => game.currentPlayer)

function handleContinue() {
  if (isCorrect.value) {
    game.proceedToPlacement()
  } else {
    game.proceedFromWrongAnswer()
  }
}

const iconStyle = computed(() => {
  if (isCorrect.value) {
    return {
      background: 'radial-gradient(circle at 35% 35%, #4ade80, #16a34a 60%, #15803d)',
      boxShadow: '0 0 60px rgba(34, 197, 94, 0.5), 0 0 120px rgba(34, 197, 94, 0.2), inset 0 -4px 12px rgba(0, 0, 0, 0.3)',
    }
  }
  return {
    background: 'radial-gradient(circle at 35% 35%, #f87171, #dc2626 60%, #b91c1c)',
    boxShadow: '0 0 60px rgba(239, 68, 68, 0.5), 0 0 120px rgba(239, 68, 68, 0.2), inset 0 -4px 12px rgba(0, 0, 0, 0.3)',
  }
})

const headingStyle = computed(() => {
  if (isCorrect.value) {
    return { textShadow: '0 0 40px rgba(34, 197, 94, 0.4), 0 2px 4px rgba(0, 0, 0, 0.5)' }
  }
  return { textShadow: '0 0 40px rgba(239, 68, 68, 0.4), 0 2px 4px rgba(0, 0, 0, 0.5)' }
})
</script>

<template>
  <div
    class="flex flex-col items-center justify-center h-screen select-none touch-manipulation px-6"
    :class="isCorrect ? 'bg-result-correct' : 'bg-result-incorrect'"
    @click="handleContinue"
  >
    <!-- Result icon -->
    <div
      class="w-24 h-24 rounded-full flex items-center justify-center mb-8"
      :style="iconStyle"
    >
      <span class="text-5xl font-bold drop-shadow-lg">{{ isCorrect ? '✓' : '✗' }}</span>
    </div>

    <!-- Result text -->
    <h1
      class="text-5xl md:text-6xl font-extrabold text-white text-center mb-4"
      :style="headingStyle"
    >
      {{ isCorrect ? t('answer.correct') : t('answer.incorrect') }}
    </h1>

    <!-- Player indicator -->
    <div class="flex items-center gap-3 mb-12">
      <div
        class="w-6 h-6 rounded-full ring-2 ring-white/10"
        :style="{
          backgroundColor: player ? COLOR_HEX[player.color] : '#666',
          boxShadow: player ? `0 0 10px ${COLOR_HEX[player.color]}50` : 'none'
        }"
      ></div>
      <span class="text-lg text-white/70">{{ player?.name }}</span>
    </div>

    <!-- Continue hint -->
    <p class="text-white/50 text-lg">
      {{ t('answer.continue') }}
    </p>
  </div>
</template>
