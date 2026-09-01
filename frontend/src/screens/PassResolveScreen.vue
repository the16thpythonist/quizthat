<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import type { MultipleChoiceAnswerData } from '../types/session'

const { t } = useI18n()
const game = useGameStore()

const declined = computed(() => game.turn?.pass?.result === 'declined')

/** Only now is the answer revealed — after the pass has been resolved. */
const correctAnswer = computed(() => {
  const q = game.currentQuestion
  if (!q || q.question_type !== 'multiple_choice') return ''
  const data = q.answer_data as MultipleChoiceAnswerData
  return data.options[data.correct_index] ?? ''
})

function handleContinue() {
  game.proceedFromPassResolve()
}
</script>

<template>
  <div
    class="qt-screen qt-doodles select-none"
    style="background: linear-gradient(158deg, #2A0D42 0%, #35114F 55%, #4A1670 100%)"
    @click="handleContinue"
  >
    <div class="qt-verdict">
      <div class="qt-verdict-mark" style="font-size: 42px">{{ declined ? '—' : '✗' }}</div>
      <h1 class="qt-verdict-title">
        {{ declined ? t('passResolve.declined') : t('answer.incorrect') }}
      </h1>

      <div v-if="correctAnswer" class="qt-reveal">
        {{ t('answer.correctAnswerWas', { answer: '' }) }}<br />
        <b>{{ correctAnswer }}</b>
      </div>

      <p class="qt-gate-tap" style="margin-top: 30px">{{ t('answer.continue') }}</p>
    </div>
  </div>
</template>
