<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import type { MultipleChoiceAnswerData } from '../types/session'

const { t } = useI18n()
const game = useGameStore()

const correctAnswer = computed(() => {
  if (!game.currentQuestion) return ''
  if (game.currentQuestion.question_type === 'multiple_choice') {
    const data = game.currentQuestion.answer_data as MultipleChoiceAnswerData
    return data.options[data.correct_index] ?? ''
  }
  return ''
})

function handleContinue() {
  game.proceedFromPassResolve()
}
</script>

<template>
  <div
    class="flex flex-col items-center justify-center h-screen bg-game-dark text-white select-none touch-manipulation"
    @click="handleContinue"
  >
    <h2
      class="text-3xl font-bold mb-6 text-gray-400"
      :style="{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)' }"
    >
      {{ t('passResolve.declined') }}
    </h2>

    <div
      class="px-8 py-4 rounded-2xl mb-12"
      :style="{
        background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.2) 0%, rgba(80, 35, 10, 0.25) 100%)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        boxShadow: '0 0 24px rgba(245, 158, 11, 0.1), 0 4px 16px rgba(0, 0, 0, 0.3)',
      }"
    >
      <p class="text-xl text-amber-400 text-center">
        {{ t('answer.correctAnswerWas', { answer: correctAnswer }) }}
      </p>
    </div>

    <p class="text-white/40 text-lg">
      {{ t('answer.continue') }}
    </p>
  </div>
</template>
