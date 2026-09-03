<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from './stores/game'
import { screenForState } from './engine/screenMap'
import { audioManager } from './audio/audioManager'
import {
  SFX,
  MUSIC,
  VOICE,
  MUSIC_FADE_IN_MS,
  MUSIC_SWAP_FADE_MS,
  SELECTION_RAMP_MS,
  AMBIENCE,
  VICTORY_MUSIC_SCALE,
  VICTORY_FADE_MS,
  CLICK_PITCH_JITTER,
  voiceLine,
} from './audio/sfx'
import BoardViewerOverlay from './components/BoardViewerOverlay.vue'
import SettingsSheet from './components/SettingsSheet.vue'
import AnimationTestScreen from './screens/AnimationTestScreen.vue'
import AudioTestScreen from './screens/AudioTestScreen.vue'

const game = useGameStore()
const { locale } = useI18n()
const currentScreen = computed(() => screenForState(game.state))

const testRoute = ref(window.location.hash)
/** Test benches run silent — they drive audio themselves. */
const isTestRoute = computed(
  () => testRoute.value === '#test-board' || testRoute.value === '#test-audio',
)

/**
 * Opening sequence, once per page load: the music fades up over
 * MUSIC_FADE_IN_MS, then the narrator welcomes the players.
 *
 * startMusic() resolves only once playback has really begun — if the browser
 * blocked autoplay that is the user's first tap — so the fade and the voice line
 * stay in step instead of elapsing silently behind a suspended AudioContext.
 *
 * The welcome is skipped if the player has already left the title screen during
 * the fade, since greeting them mid-setup would be odd. Music ducks under the
 * voice automatically (audioManager's voice queue).
 */
let introStarted = false

async function playIntro(): Promise<void> {
  if (isTestRoute.value) return
  await audioManager.startMusic(MUSIC.GAMEPLAY_LOOP, { fadeInMs: MUSIC_FADE_IN_MS })
  await new Promise((resolve) => setTimeout(resolve, MUSIC_FADE_IN_MS))
  if (game.state !== 'setup' || isTestRoute.value) return
  audioManager.enqueueVoice(voiceLine(VOICE.WELCOME, locale.value))
}

/**
 * States where a player is working out an answer, and the ticking suspense bed
 * plays. Includes `battle_answering`: each player entering their guess is the
 * same beat as answering a question, so it gets the same bed.
 */
const QUESTION_STATES = [
  'question_display',
  'gambler_question',
  'pass_answering',
  'battle_answering',
]
/** States showing an answer verdict. */
const VERDICT_STATES = ['answer_correct', 'answer_wrong', 'pass_resolve', 'gambler_resolve']
/** States where the gameplay loop plays in full. */
const MUSIC_STATES = ['selection', 'gambler_confirm']

/**
 * Music lifecycle, by screen:
 *
 *   title / selection  gameplay loop, ramping in over SELECTION_RAMP_MS
 *   question           ticking suspense bed (crossfaded)
 *   verdict            silence — the sting and the remark own the beat
 *   victory            gameplay loop well back, applause on the ambience layer
 *   everything else    silence
 *
 * Driven off game state rather than a screen's onMounted, because screens mount
 * and unmount constantly and the music must survive that. startMusic() is
 * idempotent, so re-firing on every transition is harmless.
 */
watch(
  [() => game.state, isTestRoute],
  ([state, testing]) => {
    // The audio test bench drives playback itself; the game's own music would
    // fight whatever is being auditioned, so it is silenced there entirely.
    if (testing) {
      audioManager.stopMusic()
      return
    }
    if (!introStarted && state === 'setup') {
      introStarted = true
      void playIntro()
      return
    }

    if (state === 'victory') {
      // Celebration: the gameplay loop drops right back and an applause bed runs
      // on the ambience layer on top of it. VictoryScreen fires the cheer and the
      // winner callout.
      void audioManager.startMusic(MUSIC.GAMEPLAY_LOOP, {
        fadeInMs: VICTORY_FADE_MS,
        volumeScale: VICTORY_MUSIC_SCALE,
      })
      audioManager.setMusicScale(VICTORY_MUSIC_SCALE, VICTORY_FADE_MS)
      void audioManager.startAmbience(AMBIENCE.APPLAUSE, { fadeInMs: VICTORY_FADE_MS })
    } else if (QUESTION_STATES.includes(state)) {
      // Suspense bed while the question is up.
      audioManager.stopAmbience()
      audioManager.setMusicScale(1, MUSIC_SWAP_FADE_MS)
      void audioManager.startMusic(MUSIC.QUESTION_TICK, { fadeInMs: MUSIC_SWAP_FADE_MS })
    } else if (VERDICT_STATES.includes(state)) {
      // Silence on the verdict screens: the sting and the narrator's remark are
      // the whole point of the beat, and anything under them dilutes it.
      audioManager.stopMusic()
      audioManager.stopAmbience()
    } else if (MUSIC_STATES.includes(state) || state === 'setup') {
      audioManager.stopAmbience()
      // Selection is the only screen where the music really plays, and it creeps
      // in over SELECTION_RAMP_MS rather than arriving at full level.
      audioManager.setMusicScale(1, SELECTION_RAMP_MS)
      void audioManager.startMusic(MUSIC.GAMEPLAY_LOOP, { fadeInMs: SELECTION_RAMP_MS })
    } else {
      // Turn gates, peg placement, win check: silence.
      audioManager.stopMusic()
      audioManager.stopAmbience()
    }
  },
  { immediate: true },
)

/**
 * Narrator sizes up the roster when the players are confirmed with "Weiter"
 * (player_setup -> game_settings). The line itself was chosen in the store, off
 * the seeded PRNG; a language with no file is silent, since the voice queue
 * skips entries that fail to load.
 *
 * playVoiceNow() rather than enqueueVoice(): if the title-screen welcome is
 * still running, this supersedes it instead of queueing behind it.
 */
watch(
  () => game.setupPhase,
  (phase, previous) => {
    if (previous === 'player_setup' && phase === 'game_settings' && game.playerIntroLine) {
      audioManager.playVoiceNow(
        voiceLine(VOICE.PLAYER_INTRO, locale.value, { key: game.playerIntroLine }),
      )
    }
  },
)

/**
 * Click feedback for every button, via one delegated listener rather than a call
 * in each of the twelve screens — new buttons get it for free.
 *
 * pointerdown, not click: the sound wants to land with the finger, and waiting
 * for click adds perceptible lag. Accent CTAs get the fuller BUTTON_TAP; back
 * arrows, colour swatches and steppers get the lighter CARD_SELECT.
 */
function onPointerDown(event: PointerEvent): void {
  const button = (event.target as HTMLElement | null)?.closest('button')
  if (!button || button.disabled) return
  const isPrimary = button.classList.contains('qt-cta--accent')
  audioManager.playSfx(isPrimary ? SFX.BUTTON_TAP : SFX.CARD_SELECT, {
    pitchJitter: CLICK_PITCH_JITTER,
  })
}

function onHashChange() {
  testRoute.value = window.location.hash
}

onMounted(() => {
  window.addEventListener('hashchange', onHashChange)
  document.addEventListener('pointerdown', onPointerDown)
})
onUnmounted(() => {
  window.removeEventListener('hashchange', onHashChange)
  document.removeEventListener('pointerdown', onPointerDown)
})
</script>

<template>
  <AnimationTestScreen v-if="testRoute === '#test-board'" />
  <AudioTestScreen v-else-if="testRoute === '#test-audio'" />
  <template v-else>
    <component :is="currentScreen" />
    <BoardViewerOverlay />
    <SettingsSheet />
  </template>
</template>
