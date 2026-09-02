<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { audioManager } from '../audio/audioManager'
import { VOICE, voiceLine } from '../audio/sfx'
import { passLine } from '../engine/algorithms'
import { COLOR_HEX } from '../types/session'
import BoardGrid from '../components/BoardGrid.vue'

const { t, locale } = useI18n()
const game = useGameStore()

const locked = ref(true)
const showTapHint = ref(false)

const passPlayer = computed(() => {
  if (!game.turn?.pass) return null
  return game.players[game.turn.pass.pass_player_index] ?? null
})

let lockTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  // 0.5s tap lockout
  lockTimer = setTimeout(() => {
    locked.value = false
    showTapHint.value = true
  }, 500)

  // Only one phrasing per colour here — the pass gate is comparatively rare, so
  // it does not wear the way the turn callout does.
  const colour = passPlayer.value?.color
  if (colour) {
    audioManager.playVoiceNow(
      voiceLine(VOICE.TRANSITION, locale.value, { key: passLine(colour) }),
    )
  }
})

onUnmounted(() => {
  if (lockTimer) clearTimeout(lockTimer)
})

const colorHex = computed(() => (passPlayer.value ? COLOR_HEX[passPlayer.value.color] : '#666'))

const groundStyle = computed(() => ({
  background: `radial-gradient(ellipse at 50% 35%, ${colorHex.value}dd 0%, ${colorHex.value} 45%, ${colorHex.value}77 100%)`,
}))

function handleTap() {
  if (locked.value) return
  game.proceedFromPassGate()
}
</script>

<template>
  <div class="qt-screen qt-doodles select-none" :style="groundStyle" @click="handleTap">
    <div class="qt-gate">
      <div v-if="passPlayer" class="qt-gate-initial">
        {{ passPlayer.name.charAt(0)?.toUpperCase() }}
      </div>
      <h1 class="qt-gate-title">{{ t('passGate.yourChance', { name: passPlayer?.name ?? '' }) }}</h1>
      <p class="qt-gate-sub">{{ t('passGate.reducedReward') }}</p>

      <div v-if="passPlayer" class="my-6">
        <BoardGrid :board="passPlayer.board" :player-color="passPlayer.color" :cell-size="42" />
      </div>

      <p class="qt-gate-tap transition-opacity duration-500" :class="showTapHint ? 'opacity-60' : 'opacity-0'">
        {{ t('passGate.tapToContinue') }}
      </p>
    </div>
  </div>
</template>
