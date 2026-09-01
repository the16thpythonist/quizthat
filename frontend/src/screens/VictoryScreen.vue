<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import BoardGrid from '../components/BoardGrid.vue'
import { COLOR_HEX } from '../types/session'

const { t } = useI18n()
const game = useGameStore()

const winner = computed(() => {
  if (game.winnerPlayerIndex === null) return null
  return game.players[game.winnerPlayerIndex] ?? null
})

const showConfetti = ref(false)

onMounted(() => {
  // Trigger confetti animation after a brief delay
  setTimeout(() => {
    showConfetti.value = true
  }, 300)
})

function handlePlayAgain() {
  game.resetGame()
}

function handleBackToMenu() {
  game.resetGame()
}

const winnerColor = computed(() => winner.value ? COLOR_HEX[winner.value.color] : '#666')
</script>

<template>
  <div
    class="qt-screen qt-doodles relative overflow-hidden"
    :style="{
      background: winner
        ? `radial-gradient(ellipse at 50% 30%, ${winnerColor}dd 0%, ${winnerColor} 45%, ${winnerColor}66 100%)`
        : 'var(--qt-ground-gradient)',
    }"
  >
    <!-- Confetti -->
    <div v-if="showConfetti" class="qt-confetti">
      <i
        v-for="i in 80"
        :key="i"
        class="animate-confetti"
        :style="{
          left: (Math.random() * 100) + '%',
          top: '-5%',
          backgroundColor: ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#F97316', '#E8705F', '#F0C24B'][i % 8],
          animationDelay: (Math.random() * 3) + 's',
          animationDuration: (2.5 + Math.random() * 3) + 's',
          '--drift': (Math.random() * 200 - 100) + 'px',
        }"
      ></i>
    </div>

    <div class="qt-gate">
      <div style="font-size: 38px; margin-bottom: 4px">👑</div>
      <div class="qt-gate-initial">{{ winner?.name?.charAt(0)?.toUpperCase() }}</div>

      <h1 class="qt-gate-title">{{ t('victory.wins', { name: winner?.name ?? '' }) }}</h1>
      <p class="qt-gate-sub">{{ t('victory.congratulations') }}</p>

      <!-- the winning line stays highlighted in gold -->
      <div v-if="winner" class="my-6">
        <BoardGrid
          :board="winner.board"
          :player-color="winner.color"
          :winning-line="game.winningLine"
          :cell-size="42"
        />
      </div>

      <div class="w-full flex flex-col gap-2.5">
        <button class="qt-cta" @click="handlePlayAgain">{{ t('victory.playAgain') }}</button>
        <button class="qt-cta qt-cta--ghost" @click="handleBackToMenu">{{ t('victory.backToMenu') }}</button>
      </div>
    </div>
  </div>
</template>
