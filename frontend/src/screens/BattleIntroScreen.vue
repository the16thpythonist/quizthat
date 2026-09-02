<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { audioManager } from '../audio/audioManager'
import { VOICE, voiceLine } from '../audio/sfx'
import { battleFormatLine } from '../engine/algorithms'

/** Announces the battle that closes a round, and which format it is. */
const { t, locale } = useI18n()
const game = useGameStore()

const format = computed(() => game.battle?.question_type ?? 'estimation')

/** A Duel is the same machinery between two named players, so it says so. */
const duel = computed(() => {
  const b = game.battle
  if (!b || b.challenger_index === null) return null
  const challenger = game.players[b.challenger_index]
  const opponent = game.players[b.order[1] ?? -1]
  if (!challenger || !opponent) return null
  return { challenger: challenger.name, opponent: opponent.name }
})

/**
 * Announcement, then the format callout queued behind it. Two clips rather than
 * six combined recordings: three announcements x two formats gives six pairings
 * from five files, and the announcement can stay random while the format line
 * has to state which format this actually is.
 */
onMounted(() => {
  const intro = game.battleIntroLine
  const line = (key: string) => voiceLine(VOICE.BATTLE, locale.value, { key })
  if (intro) audioManager.playVoiceNow(line(intro))
  audioManager.enqueueVoice(line(battleFormatLine(format.value)))
})

onUnmounted(() => audioManager.clearQueue())
</script>

<template>
  <div
    class="qt-screen qt-doodles select-none"
    style="background: linear-gradient(158deg,#3F1263 0%,#7A1F8B 55%,#A8248C 100%)"
    @click="game.proceedFromBattleIntro()"
  >
    <div class="qt-gate">
      <div class="qt-battle-mark">⚔</div>
      <h1 class="qt-gate-title">{{ t(duel ? 'battle.duelTitle' : 'battle.title') }}</h1>
      <p class="qt-gate-sub">{{ t('battle.format.' + format) }}</p>
      <p class="qt-joker-desc" style="max-width: 420px; margin-top: 18px">
        {{ duel ? t('battle.duelRules', duel) : t('battle.rules') }}
      </p>
      <p class="qt-gate-tap" style="margin-top: 26px">{{ t('turnGate.tapToContinue') }}</p>
    </div>
  </div>
</template>
