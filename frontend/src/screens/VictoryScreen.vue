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
    class="flex flex-col items-center justify-center min-h-screen text-white relative overflow-hidden"
    :style="{
      background: winner
        ? `radial-gradient(ellipse at center, ${winnerColor}30 0%, ${winnerColor}15 40%, #060610 80%)`
        : '#060610',
    }"
  >
    <!-- Confetti particles -->
    <div v-if="showConfetti" class="absolute inset-0 pointer-events-none">
      <div
        v-for="i in 80"
        :key="i"
        class="absolute animate-confetti"
        :style="{
          left: (Math.random() * 100) + '%',
          top: '-5%',
          width: (i % 3 === 0 ? 3 : 8) + 'px',
          height: (i % 3 === 0 ? 8 : 3) + 'px',
          borderRadius: i % 4 === 0 ? '50%' : '1px',
          backgroundColor: ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#F97316', '#EC4899', '#14B8A6'][i % 8],
          animationDelay: (Math.random() * 3) + 's',
          animationDuration: (2.5 + Math.random() * 3) + 's',
          '--drift': (Math.random() * 200 - 100) + 'px',
        }"
      ></div>
    </div>

    <!-- Winner circle -->
    <div
      class="w-40 h-40 rounded-full flex items-center justify-center mb-8"
      :style="{
        background: winner
          ? `radial-gradient(circle at 35% 35%, ${winnerColor}ee, ${winnerColor} 50%, ${winnerColor}bb 100%)`
          : '#666',
        boxShadow: `0 0 60px ${winnerColor}50, 0 0 120px ${winnerColor}20, inset 0 -6px 16px rgba(0,0,0,0.3), inset 0 3px 8px rgba(255,255,255,0.15)`,
      }"
    >
      <span class="text-7xl font-extrabold text-white/90 drop-shadow-lg">
        {{ winner?.name?.charAt(0)?.toUpperCase() }}
      </span>
    </div>

    <!-- Win text -->
    <h1
      class="text-5xl md:text-7xl font-extrabold text-center mb-4 relative"
      :style="{
        textShadow: `0 0 40px ${winnerColor}40, 0 4px 8px rgba(0,0,0,0.5)`,
      }"
    >
      {{ t('victory.wins', { name: winner?.name ?? '' }) }}
    </h1>
    <p class="text-2xl text-white/60 mb-8">
      {{ t('victory.congratulations') }}
    </p>

    <!-- Winning board -->
    <div v-if="winner" class="mb-10">
      <BoardGrid
        :board="winner.board"
        :player-color="winner.color"
        :winning-line="game.winningLine"
      />
    </div>

    <!-- Action buttons -->
    <div class="flex gap-4">
      <button
        class="px-8 py-4 text-white text-xl font-bold rounded-2xl transition-all duration-200 touch-manipulation hover:scale-[1.02] active:scale-[0.98]"
        :style="{
          background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
          boxShadow: '0 0 20px rgba(99, 102, 241, 0.25), 0 4px 16px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(129, 140, 248, 0.3)',
        }"
        @click="handlePlayAgain"
      >
        {{ t('victory.playAgain') }}
      </button>
      <button
        class="px-8 py-4 text-white text-lg rounded-2xl transition-all duration-200 touch-manipulation glass-card inner-shine hover:scale-[1.01] active:scale-[0.99]"
        @click="handleBackToMenu"
      >
        {{ t('victory.backToMenu') }}
      </button>
    </div>
  </div>
</template>

<style>
@keyframes confetti-fall {
  0% {
    transform: translateY(0) translateX(0) rotate(0deg) scale(1);
    opacity: 1;
  }
  25% {
    transform: translateY(25vh) translateX(calc(var(--drift, 0px) * 0.5)) rotate(180deg) scale(0.9);
    opacity: 1;
  }
  50% {
    transform: translateY(50vh) translateX(var(--drift, 0px)) rotate(360deg) scale(1);
    opacity: 0.8;
  }
  75% {
    transform: translateY(75vh) translateX(calc(var(--drift, 0px) * 0.7)) rotate(540deg) scale(0.85);
    opacity: 0.5;
  }
  100% {
    transform: translateY(105vh) translateX(var(--drift, 0px)) rotate(720deg) scale(0.7);
    opacity: 0;
  }
}

.animate-confetti {
  animation: confetti-fall linear forwards;
}
</style>
