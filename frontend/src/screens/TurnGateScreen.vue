<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { COLOR_HEX } from '../types/session'

const { t } = useI18n()
const game = useGameStore()

const locked = ref(true)
const showTapHint = ref(false)

onMounted(() => {
  // 0.5s tap lockout to prevent accidental tap-through during device handoff
  setTimeout(() => {
    locked.value = false
    showTapHint.value = true
  }, 500)
})

function handleTap() {
  if (locked.value) return
  game.proceedFromTurnGate()
}

const player = game.currentPlayer
const playerColor = player?.color ?? 'blue'
const playerName = player?.name ?? ''
const colorHex = COLOR_HEX[playerColor]
</script>

<template>
  <div
    class="flex flex-col items-center justify-center h-screen select-none touch-manipulation relative overflow-hidden"
    :style="{
      background: `radial-gradient(ellipse at center, ${colorHex}cc 0%, ${colorHex} 40%, ${colorHex}90 100%)`,
    }"
    @click="handleTap"
  >
    <!-- Ambient glow -->
    <div
      class="absolute inset-0 pointer-events-none"
      :style="{
        background: `radial-gradient(circle at 50% 40%, rgba(255,255,255,0.08) 0%, transparent 60%)`,
      }"
    ></div>

    <!-- Player initial circle -->
    <div
      class="w-24 h-24 rounded-full flex items-center justify-center mb-8"
      :style="{
        background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.25), rgba(255,255,255,0.05) 60%)`,
        border: '2px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 0 40px rgba(255,255,255,0.1), inset 0 -4px 12px rgba(0,0,0,0.2)',
      }"
    >
      <span class="text-5xl font-extrabold text-white/90">
        {{ playerName.charAt(0)?.toUpperCase() }}
      </span>
    </div>

    <h1
      class="text-5xl md:text-7xl font-extrabold text-white text-center mb-8 relative"
      :style="{ textShadow: '0 0 40px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.4)' }"
    >
      {{ t('turnGate.yourTurn', { name: playerName }) }}
    </h1>

    <p
      class="text-xl text-white/70 transition-opacity duration-500 relative"
      :class="showTapHint ? 'opacity-100' : 'opacity-0'"
    >
      {{ t('turnGate.tapToContinue') }}
    </p>
  </div>
</template>
