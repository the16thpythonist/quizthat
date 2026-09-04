<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { useActions } from '../composables/useActions'
import { audioManager } from '../audio/audioManager'
import { SFX } from '../audio/sfx'
import GameBar from '../components/GameBar.vue'
import PlayerStrip from '../components/PlayerStrip.vue'

/**
 * How the bet went.
 *
 * On a win this only announces it — the three pegs are then placed on the
 * ordinary placement screen, one roulette each, so they arrive the same way
 * every other peg does. The player just never gets to choose where.
 */
const { t } = useI18n()
const game = useGameStore()
const act = useActions()

const player = computed(() => game.currentPlayer)
const won = computed(() => game.gamblerWon)

onMounted(() => {
  audioManager.playSfx(won.value ? SFX.CORRECT : SFX.INCORRECT)
})

function handleContinue() {
  act.proceedFromGamblerResolve()
}
</script>

<template>
  <div
    class="qt-screen qt-doodles select-none"
    :style="won
      ? { background: 'linear-gradient(158deg,#2F7F5C 0%,#3E9E72 55%,#57B98A 100%)' }
      : { background: 'linear-gradient(158deg,#2A0D42 0%,#35114F 55%,#4A1670 100%)' }"
    @click="handleContinue"
  >
    <GameBar />
    <PlayerStrip :player="player" :context="t('jokerNames.the_gambler')" />

    <div class="qt-verdict">
      <div class="qt-verdict-mark">{{ won ? '✓' : '✗' }}</div>
      <h1 class="qt-verdict-title">{{ won ? t('gambler.won') : t('gambler.lost') }}</h1>
      <p class="qt-gate-sub">{{ won ? t('gambler.wonNote') : t('gambler.lostNote') }}</p>
      <p class="qt-gate-tap" style="margin-top: 34px">{{ t('answer.continue') }}</p>
    </div>
  </div>
</template>
