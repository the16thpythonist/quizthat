<script setup lang="ts">
/**
 * The shared view: every board, whose turn it is, and what is on the table.
 *
 * Used for two audiences that want exactly the same thing. A TV joined as a
 * spectator shows it permanently; a player shows it whenever the game is
 * waiting on somebody else. Splitting them into two screens would have meant
 * two copies of the same layout drifting apart.
 *
 * It is deliberately input-free. On a shared tablet the gate screens keep one
 * person's information private by handing the device around; here the same job
 * is done by never rendering another player's question on your phone.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { useNetStore } from '../stores/net'
import BoardGrid from '../components/BoardGrid.vue'
import { COLOR_HEX } from '../types/session'

const { t } = useI18n()
const game = useGameStore()
const net = useNetStore()

const waitingOn = computed(() =>
  game.awaitingSeat === null ? null : game.players[game.awaitingSeat] ?? null,
)

/** What the table is doing, in one line. */
const headline = computed(() => {
  if (game.state === 'victory') {
    const winner = game.winnerPlayerIndex === null ? null : game.players[game.winnerPlayerIndex]
    return winner ? t('victory.wins', { name: winner.name }) : t('victory.congratulations')
  }
  if (game.state === 'setup') return t('lobby.waitingToStart')
  if (game.battle) return t('battle.title')
  return waitingOn.value
    ? t('spectate.waitingFor', { name: waitingOn.value.name })
    : t('spectate.watching')
})

/**
 * The question text, but only once it is safe to show.
 *
 * While somebody is still answering, the teaser is all the room gets — putting
 * the question on the TV would let everyone work on it, and putting it on a
 * waiting player's phone would do the same. At the reveal it becomes shared.
 */
const publicQuestion = computed(() => {
  if (!game.currentQuestion) return null
  const shown: string[] = ['battle_reveal', 'answer_correct', 'answer_wrong', 'pass_resolve']
  return shown.includes(game.state) ? game.currentQuestion.question_text : null
})

const roundLabel = computed(() => t('spectate.round', { round: game.round }))
</script>

<template>
  <div class="qt-screen qt-doodles">
    <div class="qt-spectate-head">
      <!--
        A room can have two games going; the name is how the TV says which one
        it is showing.
      -->
      <p class="qt-spectate-round">
        <span v-if="net.lobby?.name">{{ net.lobby.name }} · </span>{{ roundLabel }}
      </p>
      <h1 class="qt-spectate-title">{{ headline }}</h1>
      <p v-if="publicQuestion" class="qt-spectate-question">{{ publicQuestion }}</p>
      <p v-else-if="net.role === 'spectator'" class="qt-spectate-sub">
        {{ t('spectate.tvHint') }}
      </p>
      <p v-else class="qt-spectate-sub">{{ t('spectate.yourTurnSoon') }}</p>
    </div>

    <div class="qt-spectate-boards">
      <div
        v-for="player in game.players"
        :key="player.index"
        class="qt-spectate-board"
        :class="{ 'is-active': player.index === game.awaitingSeat }"
      >
        <div class="qt-spectate-name">
          <span class="qt-dot" :style="{ backgroundColor: COLOR_HEX[player.color] }"></span>
          {{ player.name }}
          <span class="qt-spectate-pegs">{{ player.board.peg_count }}</span>
        </div>
        <BoardGrid
          :board="player.board"
          :player-color="player.color"
          :candidate-fields="[]"
          :cell-size="34"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.qt-spectate-head {
  text-align: center;
  padding: 28px 20px 12px;
}
.qt-spectate-round {
  margin: 0;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 2.4px;
  text-transform: uppercase;
  opacity: 0.55;
  color: #fff;
}
.qt-spectate-title {
  margin: 6px 0 0;
  font-size: clamp(24px, 4vw, 44px);
  color: #fff;
}
.qt-spectate-question {
  margin: 14px auto 0;
  max-width: 46ch;
  font-size: clamp(16px, 2vw, 22px);
  font-weight: 700;
  color: #fff;
}
.qt-spectate-sub {
  margin: 10px 0 0;
  color: #fff;
  opacity: 0.6;
  font-size: 14px;
}
.qt-spectate-boards {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  justify-content: center;
  align-content: flex-start;
  padding: 18px;
}
.qt-spectate-board {
  padding: 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid transparent;
  transition: border-color 160ms ease;
}
.qt-spectate-board.is-active {
  border-color: rgba(255, 255, 255, 0.55);
}
.qt-spectate-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #fff;
  font-weight: 900;
  font-size: 14px;
}
.qt-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.qt-spectate-pegs {
  margin-left: auto;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}
</style>
