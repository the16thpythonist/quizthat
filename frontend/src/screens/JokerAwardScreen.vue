<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { audioManager } from '../audio/audioManager'
import { SFX } from '../audio/sfx'
import GameBar from '../components/GameBar.vue'
import PlayerStrip from '../components/PlayerStrip.vue'
import JokerIcon from '../components/JokerIcon.vue'

/**
 * The joker a player just won by picking a baited card.
 *
 * It gets its own beat rather than flashing past behind the question, because
 * it is the whole reason the card was tempting. The question is already loaded
 * by the time this shows, so continuing is instant.
 */
const { t } = useI18n()
const game = useGameStore()

const player = computed(() => game.currentPlayer)
const joker = computed(() => game.jokerAwarded)

onMounted(() => {
  audioManager.playSfx(SFX.CORRECT)
})

function handleContinue() {
  game.proceedFromJokerAward()
}
</script>

<template>
  <div class="qt-screen" @click="handleContinue">
    <GameBar />
    <PlayerStrip :player="player" :context="t('joker.awarded')" />

    <div class="qt-verdict">
      <div v-if="joker" class="qt-joker-prize">
        <JokerIcon :type="joker" :size="52" />
      </div>

      <p class="qt-gate-sub">{{ t('joker.awarded') }}</p>
      <h1 class="qt-verdict-title" style="font-size: 32px">
        {{ joker ? t('jokerNames.' + joker) : '' }}
      </h1>
      <p v-if="joker" class="qt-joker-desc" style="max-width: 420px; margin-top: 14px">
        {{ t('jokerDesc.' + joker) }}
      </p>
    </div>

    <div class="qt-cta-bar">
      <button class="qt-cta qt-cta--accent" @click.stop="handleContinue">
        {{ t('answer.continue') }}
      </button>
    </div>
  </div>
</template>
