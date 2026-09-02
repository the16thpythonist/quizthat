<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { COLOR_HEX } from '../types/session'

/**
 * Hands the device to the next player.
 *
 * Its real job is to make sure the previous player's answer is off screen
 * before the next one looks — without it a battle would be won by whoever
 * goes last.
 */
const { t } = useI18n()
const game = useGameStore()

const player = computed(() => game.battlePlayer)
const colorHex = computed(() => (player.value ? COLOR_HEX[player.value.color] : '#666'))
const remaining = computed(() => {
  const b = game.battle
  return b ? b.order.length - b.answers.length : 0
})
</script>

<template>
  <div
    class="qt-screen qt-doodles select-none"
    :style="{ background: `radial-gradient(ellipse at 50% 35%, ${colorHex}dd 0%, ${colorHex} 45%, ${colorHex}77 100%)` }"
    @click="game.proceedFromBattleGate()"
  >
    <div class="qt-gate">
      <div class="qt-gate-initial">{{ player?.name.charAt(0).toUpperCase() }}</div>
      <h1 class="qt-gate-title">{{ t('battle.yourGuess', { name: player?.name ?? '' }) }}</h1>
      <p class="qt-gate-sub">{{ t('battle.remaining', { count: remaining }) }}</p>
      <p class="qt-gate-tap" style="margin-top: 30px">{{ t('turnGate.tapToContinue') }}</p>
    </div>
  </div>
</template>
