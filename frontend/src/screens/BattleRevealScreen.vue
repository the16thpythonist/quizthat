<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { COLOR_HEX } from '../types/session'
import type { EstimationAnswerData } from '../types/session'

/**
 * Every answer, the true value, the ranking, and what it cost.
 *
 * The only screen in a battle where anything is revealed — everything before it
 * is deliberately blind so no player can profit from going last.
 */
const { t } = useI18n()
const game = useGameStore()

const battle = computed(() => game.battle)
const isMap = computed(() => battle.value?.question_type === 'battle_map')

const trueValue = computed(() => {
  const q = game.currentQuestion
  if (!q || isMap.value) return ''
  const data = q.answer_data as EstimationAnswerData
  return `${formatNumber(data.correct_value)} ${data.unit}`.trim()
})

function formatNumber(value: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value)
}

/** Nearest first — the order the ranking is shown in. */
const ranked = computed(() => {
  const b = battle.value
  if (!b) return []
  return [...b.answers]
    .sort((a, c) => a.distance - c.distance)
    .map((answer, position) => {
      const player = game.players[answer.player_index]
      return {
        position: position + 1,
        name: player?.name ?? '',
        color: player ? COLOR_HEX[player.color] : '#666',
        guess: isMap.value
          ? t('battle.kmAway', { km: formatNumber(Math.round(answer.distance)) })
          : formatNumber(answer.value as number),
        isWinner: answer.player_index === b.winner_index,
        isLoser: answer.player_index === b.loser_index,
      }
    })
})

const transfer = computed(() => {
  const b = battle.value
  if (!b?.transfer) return null
  const [row, col] = b.transfer.field
  return {
    field: String.fromCharCode(65 + col) + (row + 1),
    from: game.players[b.transfer.from]?.name ?? '',
    to: game.players[b.transfer.to]?.name ?? '',
  }
})
</script>

<template>
  <div
    class="qt-screen qt-doodles select-none"
    style="background: linear-gradient(158deg,#3F1263 0%,#7A1F8B 55%,#A8248C 100%)"
    @click="game.proceedFromBattleReveal()"
  >
    <div class="qt-verdict" style="justify-content: flex-start; padding-top: 28px">
      <h1 class="qt-verdict-title" style="font-size: 30px">{{ t('battle.result') }}</h1>
      <p v-if="!isMap" class="qt-gate-sub">{{ t('battle.trueValue', { value: trueValue }) }}</p>

      <div class="qt-rank-list">
        <div
          v-for="row in ranked"
          :key="row.name + row.position"
          class="qt-rank-row"
          :class="{ 'is-winner': row.isWinner, 'is-loser': row.isLoser }"
        >
          <span class="qt-rank-pos">{{ row.position }}</span>
          <span class="qt-chip" :style="{ backgroundColor: row.color }"></span>
          <span class="qt-rank-name">{{ row.name }}</span>
          <span class="qt-rank-guess">{{ row.guess }}</span>
        </div>
      </div>

      <p v-if="transfer" class="qt-reveal" style="margin-top: 22px">
        {{ t('battle.transfer', { from: transfer.from, to: transfer.to, field: transfer.field }) }}
      </p>
      <p v-else class="qt-reveal" style="margin-top: 22px">{{ t('battle.noTransfer') }}</p>

      <p class="qt-gate-tap" style="margin-top: 26px">{{ t('answer.continue') }}</p>
    </div>
  </div>
</template>
