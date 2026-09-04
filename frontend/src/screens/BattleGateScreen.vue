<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { useActions } from '../composables/useActions'
import { useNetStore } from '../stores/net'
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
const act = useActions()
const net = useNetStore()

const player = computed(() => game.battlePlayer)
const colorHex = computed(() => (player.value ? COLOR_HEX[player.value.color] : '#666'))
const remaining = computed(() => {
  const b = game.battle
  return b ? b.order.length - b.answers.length : 0
})

/**
 * Skipped on separate devices.
 *
 * The screen exists to get the previous player's answer out of sight before
 * the next one looks. Online each phone is only ever sent its own guess — the
 * redaction does that job — so this would be an empty tap between the intro and
 * the question.
 */
onMounted(() => {
  if (net.isOnline) void act.proceedFromBattleGate()
})
</script>

<template>
  <div
    class="qt-screen qt-doodles select-none"
    :style="{ background: `radial-gradient(ellipse at 50% 35%, ${colorHex}dd 0%, ${colorHex} 45%, ${colorHex}77 100%)` }"
    @click="act.proceedFromBattleGate()"
  >
    <div class="qt-gate">
      <div class="qt-gate-initial">{{ player?.name.charAt(0).toUpperCase() }}</div>
      <h1 class="qt-gate-title">{{ t('battle.yourGuess', { name: player?.name ?? '' }) }}</h1>
      <p class="qt-gate-sub">{{ t('battle.remaining', { count: remaining }) }}</p>
      <p class="qt-gate-tap" style="margin-top: 30px">{{ t('turnGate.tapToContinue') }}</p>
    </div>
  </div>
</template>
