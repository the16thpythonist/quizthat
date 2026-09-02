<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { audioManager } from '../audio/audioManager'
import { SFX, VOICE, voiceLine } from '../audio/sfx'
import BoardGrid from '../components/BoardGrid.vue'
import BattleResultMap from '../components/BattleResultMap.vue'
import { COLOR_HEX } from '../types/session'
import type { EstimationAnswerData, BattleMapAnswerData } from '../types/session'

/**
 * Every answer, the true value, the ranking, and what it cost.
 *
 * The only screen in a battle where anything is revealed — everything before it
 * is deliberately blind so no player can profit from going last.
 */
const { t, locale } = useI18n()
const game = useGameStore()

const battle = computed(() => game.battle)
let pegTimer: ReturnType<typeof setTimeout> | null = null
const isMap = computed(() => battle.value?.question_type === 'battle_map')

const duel = computed(() => {
  const b = battle.value
  if (!b || b.challenger_index === null) return null
  const challenger = game.players[b.challenger_index]
  if (!challenger) return null
  return { challenger, won: b.winner_index === b.challenger_index }
})

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
          : t('battle.guessOff', {
              value: formatNumber(answer.value as number),
              off: formatNumber(Math.round(answer.distance * 100) / 100),
            }),
        isWinner: answer.player_index === b.winner_index,
        isLoser: answer.player_index === b.loser_index,
      }
    })
})

/** Every pin plus the true location, for the map that opens the reveal. */
const mapResult = computed(() => {
  const b = battle.value
  const q = game.currentQuestion
  if (!b || !q || !isMap.value) return null
  const target = (q.answer_data as BattleMapAnswerData).target
  return {
    target,
    guesses: b.answers.map((answer) => {
      const player = game.players[answer.player_index]
      const [lat, lng] = answer.value as [number, number]
      return {
        lat,
        lng,
        color: player ? COLOR_HEX[player.color] : '#fff',
        name: player?.name ?? '',
        label: t('battle.kmAway', { km: formatNumber(Math.round(answer.distance)) }),
      }
    }),
  }
})

/**
 * The two boards that changed, so the swap is seen rather than read.
 *
 * The move has already been applied to the store, so the loser's square is
 * empty and the winner's is filled. Marking the square on both sides is what
 * makes it legible: one shows the gap it left, the other the peg that arrived.
 */
const boards = computed(() => {
  const b = battle.value
  if (!b?.transfer) return null
  const from = game.players[b.transfer.from]
  const to = game.players[b.transfer.to]
  if (!from || !to) return null
  return { from, to, field: b.transfer.field }
})

/** Held back a beat so the peg visibly lands rather than being there already. */
const landed = ref<[number, number] | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  const field = boards.value?.field
  if (field) timer = setTimeout(() => { landed.value = field }, 700)

  // "Und die Auflösung!" as the result appears. The peg transfer thumps when the
  // stolen peg lands, so the line goes first and the hit punctuates it.
  const key = game.battleRevealLine
  if (key) audioManager.playVoiceNow(voiceLine(VOICE.BATTLE, locale.value, { key }))
  if (field) {
    pegTimer = setTimeout(() => audioManager.playSfx(SFX.PEG_DROP), 700)
  }
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
  if (pegTimer) clearTimeout(pegTimer)
  audioManager.clearQueue()
})

/** Why nothing moved — losing your own duel reads very differently from a tie. */
const noTransferLine = computed(() => {
  const d = duel.value
  if (d && !d.won) return t('battle.duelLost', { name: d.challenger.name })
  if (d) return t('battle.duelWonNothing', { name: d.challenger.name })
  return t('battle.noTransfer')
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

      <BattleResultMap
        v-if="mapResult"
        :target="mapResult.target"
        :guesses="mapResult.guesses"
      />

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

      <!-- the swap, shown on both boards -->
      <div v-if="boards" class="qt-swap">
        <div class="qt-swap-side">
          <div class="qt-swap-name">{{ boards.from.name }}</div>
          <BoardGrid
            :board="boards.from.board"
            :player-color="boards.from.color"
            :candidate-fields="[boards.field]"
            :cell-size="34"
          />
          <div class="qt-swap-label qt-swap-label--loss">
            − {{ transfer?.field }}
          </div>
        </div>

        <div class="qt-swap-arrow">→</div>

        <div class="qt-swap-side">
          <div class="qt-swap-name">{{ boards.to.name }}</div>
          <BoardGrid
            :board="boards.to.board"
            :player-color="boards.to.color"
            :last-placed-field="landed"
            :cell-size="34"
          />
          <div class="qt-swap-label qt-swap-label--gain">
            + {{ transfer?.field }}
          </div>
        </div>
      </div>

      <p v-else class="qt-reveal" style="margin-top: 22px">{{ noTransferLine }}</p>

      <p class="qt-gate-tap" style="margin-top: 26px">{{ t('answer.continue') }}</p>
    </div>
  </div>
</template>
