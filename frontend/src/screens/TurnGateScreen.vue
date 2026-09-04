<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { useActions } from '../composables/useActions'
import { audioManager } from '../audio/audioManager'
import { VOICE, voiceLine } from '../audio/sfx'
import { COLOR_HEX } from '../types/session'
import BoardGrid from '../components/BoardGrid.vue'

const { t, locale } = useI18n()
const game = useGameStore()
const act = useActions()

const locked = ref(true)
const showTapHint = ref(false)

const player = computed(() => game.currentPlayer)

/**
 * The narrator announces whose turn it is, after the tap lockout — the gate
 * exists for a device handoff, so the line should land once the tablet has
 * actually changed hands rather than while it is still moving.
 */
let lockTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  // 0.5s tap lockout to prevent accidental tap-through during device handoff
  lockTimer = setTimeout(() => {
    locked.value = false
    showTapHint.value = true
  }, 500)

  const key = game.turnLine
  if (key) audioManager.playVoiceNow(voiceLine(VOICE.TRANSITION, locale.value, { key }))
})

onUnmounted(() => {
  if (lockTimer) clearTimeout(lockTimer)
})
const playerName = computed(() => player.value?.name ?? '')
const colorHex = computed(() => (player.value ? COLOR_HEX[player.value.color] : '#666'))

/** The gate takes the player's own colour: this screen exists to say the
 *  device is now theirs, so the ground should be unmistakably theirs. */
const groundStyle = computed(() => ({
  background: `radial-gradient(ellipse at 50% 35%, ${colorHex.value}dd 0%, ${colorHex.value} 45%, ${colorHex.value}77 100%)`,
}))

function handleTap() {
  if (locked.value) return
  act.proceedFromTurnGate()
}
</script>

<template>
  <div class="qt-screen qt-doodles select-none" :style="groundStyle" @click="handleTap">
    <div class="qt-gate">
      <div class="qt-gate-initial">{{ playerName.charAt(0)?.toUpperCase() }}</div>
      <h1 class="qt-gate-title">{{ t('turnGate.yourTurn', { name: playerName }) }}</h1>
      <p class="qt-gate-sub">
        {{ t('turnGate.roundAndPegs', { round: game.round, pegs: player?.board.peg_count ?? 0 }) }}
      </p>

      <!-- the incoming player sees where they stand before they start -->
      <div v-if="player" class="my-6">
        <BoardGrid :board="player.board" :player-color="player.color" :cell-size="42" />
      </div>

      <p class="qt-gate-tap transition-opacity duration-500" :class="showTapHint ? 'opacity-60' : 'opacity-0'">
        {{ t('turnGate.tapToContinue') }}
      </p>
    </div>
  </div>
</template>
