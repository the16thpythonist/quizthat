<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'

/** Announces the battle that closes a round, and which format it is. */
const { t } = useI18n()
const game = useGameStore()

const format = computed(() => game.battle?.question_type ?? 'estimation')
</script>

<template>
  <div
    class="qt-screen qt-doodles select-none"
    style="background: linear-gradient(158deg,#3F1263 0%,#7A1F8B 55%,#A8248C 100%)"
    @click="game.proceedFromBattleIntro()"
  >
    <div class="qt-gate">
      <div class="qt-battle-mark">⚔</div>
      <h1 class="qt-gate-title">{{ t('battle.title') }}</h1>
      <p class="qt-gate-sub">{{ t('battle.format.' + format) }}</p>
      <p class="qt-joker-desc" style="max-width: 420px; margin-top: 18px">
        {{ t('battle.rules') }}
      </p>
      <p class="qt-gate-tap" style="margin-top: 26px">{{ t('turnGate.tapToContinue') }}</p>
    </div>
  </div>
</template>
