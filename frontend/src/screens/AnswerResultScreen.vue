<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { audioManager } from '../audio/audioManager'
import { SFX, VOICE, VERDICT_REMARK_DELAY_MS, voiceLine } from '../audio/sfx'
import { COLOR_HEX } from '../types/session'

const { t, locale } = useI18n()
const game = useGameStore()

const isCorrect = computed(() => game.state === 'answer_correct')
const player = computed(() => game.currentPlayer)

/**
 * Verdict sting, then the narrator's remark once it has had its moment. App.vue
 * has already pulled the music down to a quiet bed for this screen, so both land
 * in the clear.
 *
 * The timer is cancelled on unmount: tapping through quickly should not have the
 * remark arrive over the next screen.
 */
let remarkTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  audioManager.playSfx(isCorrect.value ? SFX.CORRECT : SFX.INCORRECT)
  const key = game.verdictRemark
  if (!key) return
  remarkTimer = setTimeout(() => {
    audioManager.playVoiceNow(voiceLine(VOICE.VERDICT, locale.value, { key }))
  }, VERDICT_REMARK_DELAY_MS)
})

onUnmounted(() => {
  if (remarkTimer) clearTimeout(remarkTimer)
})

/**
 * On a wrong answer the question passes on, so the answer is deliberately NOT
 * revealed here — only PassResolveScreen shows it, once nobody can still win
 * the peg.
 */
const nextUp = computed(() => {
  if (isCorrect.value) return null
  const idx = game.turn?.previous_round_player_index
  if (idx === null || idx === undefined) return null
  if (game.round < 2) return null
  return game.players[idx] ?? null
})

/** Pegs this answer is worth, so "+2 Stifte" is honest about the boost. */
const pegsEarned = computed(() => {
  let pegs = 1
  const idx = game.turn?.selected_slot_index
  const slot = idx !== null && idx !== undefined ? game.turn?.offered_slots[idx] : null
  if (slot?.has_2x_boost) pegs++
  if (game.turn?.double_down_active) pegs++
  return pegs
})

const groundStyle = computed(() =>
  isCorrect.value
    ? { background: 'linear-gradient(158deg, #2F7F5C 0%, #3E9E72 55%, #57B98A 100%)' }
    : { background: 'linear-gradient(158deg, #2A0D42 0%, #35114F 55%, #4A1670 100%)' },
)

function handleContinue() {
  if (isCorrect.value) {
    game.proceedToPlacement()
  } else {
    game.proceedFromWrongAnswer()
  }
}
</script>

<template>
  <div class="qt-screen qt-doodles select-none" :style="groundStyle" @click="handleContinue">
    <div class="qt-verdict">
      <div class="qt-verdict-mark">{{ isCorrect ? '✓' : '✗' }}</div>
      <h1 class="qt-verdict-title">{{ isCorrect ? t('answer.correct') : t('answer.incorrect') }}</h1>

      <p v-if="isCorrect" class="qt-gate-sub">
        {{ player?.name }} · {{ t('answer.pegsEarned', { count: pegsEarned }) }}
      </p>

      <!-- The player who inherits the question is named in their own colour,
           but the ground stays plum: it is not their turn yet. -->
      <div v-if="nextUp" class="qt-next-up">
        <div
          class="qt-next-avatar"
          :style="{ backgroundColor: COLOR_HEX[nextUp.color] }"
        >{{ nextUp.name.charAt(0)?.toUpperCase() }}</div>
        <div class="qt-next-name" :style="{ color: COLOR_HEX[nextUp.color] }">{{ nextUp.name }}</div>
        <div class="qt-next-sub">{{ t('answer.getsTheChance') }}</div>
      </div>

      <p class="qt-gate-tap" style="margin-top: 30px">
        {{ nextUp ? t('answer.handOverDevice') : t('answer.continue') }}
      </p>
    </div>
  </div>
</template>
