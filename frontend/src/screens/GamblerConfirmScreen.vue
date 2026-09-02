<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import GameBar from '../components/GameBar.vue'
import PlayerStrip from '../components/PlayerStrip.vue'
import BoardGrid from '../components/BoardGrid.vue'
import JokerIcon from '../components/JokerIcon.vue'

/**
 * What the Gambler is about to risk.
 *
 * The staked peg is picked for you and shown on your own board, so the bet is
 * concrete before you take it — you can see whether it is the peg holding a
 * line together or one in a dead corner.
 */
const { t } = useI18n()
const game = useGameStore()

const player = computed(() => game.currentPlayer)
const staked = computed(() => game.turn?.gambler_staked_field ?? null)
const stakedLabel = computed(() => {
  const field = staked.value
  if (!field) return ''
  return String.fromCharCode(65 + field[1]) + (field[0] + 1)
})
</script>

<template>
  <div class="qt-screen">
    <GameBar />
    <PlayerStrip :player="player" :context="t('jokerNames.the_gambler')" />

    <div class="qt-verdict" style="justify-content: flex-start; padding-top: 24px">
      <div class="qt-joker-prize" style="width: 84px; height: 84px; border-radius: 26px">
        <JokerIcon type="the_gambler" :size="40" />
      </div>

      <h1 class="qt-verdict-title" style="font-size: 28px">{{ t('gambler.title') }}</h1>
      <p class="qt-gate-sub">{{ t('gambler.staking', { field: stakedLabel }) }}</p>

      <div v-if="player" class="my-6">
        <BoardGrid
          :board="player.board"
          :player-color="player.color"
          :candidate-fields="staked ? [staked] : []"
          :cell-size="46"
          labels
        />
      </div>

      <p class="qt-joker-desc" style="max-width: 420px">{{ t('gambler.terms') }}</p>
    </div>

    <div class="qt-cta-bar">
      <button class="qt-cta qt-cta--accent" @click="game.confirmGambler()">
        {{ t('gambler.confirm') }}
      </button>
      <button class="qt-cta qt-cta--ghost" @click="game.cancelGambler()">
        {{ t('joker.cancel') }}
      </button>
    </div>
  </div>
</template>
