<script setup lang="ts">
/**
 * Audio test bench — reachable at #test-audio.
 *
 * Plays everything through the real `audioManager`, not raw <audio> elements, so
 * what you hear here is what the game does: the same ducking, pitch jitter, fade
 * and missing-file handling. The behaviour section exercises the parts that are
 * timing-dependent and therefore easy to get wrong.
 *
 * Availability is probed with HEAD requests, so unfilled SFX slots show up as
 * MISSING rather than silently doing nothing.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { audioManager } from '../audio/audioManager'
import {
  SFX,
  MUSIC,
  AMBIENCE,
  VOICE,
  MUSIC_FADE_IN_MS,
  MUSIC_SWAP_FADE_MS,
  QUIET_MUSIC_SCALE,
  VERDICT_REMARK_DELAY_MS,
  VICTORY_MUSIC_SCALE,
  VICTORY_FADE_MS,
  VICTORY_LINE_DELAY_MS,
  CLICK_PITCH_JITTER,
  voiceLine,
} from '../audio/sfx'
import {
  GENERIC_PLAYER_INTRO_KEYS,
  VERDICT_CORRECT_KEYS,
  VERDICT_WRONG_KEYS,
  VICTORY_REMARK_KEYS,
} from '../engine/algorithms'

const { locale } = useI18n()

type Row = { label: string; src: string; note?: string }

const COLOURS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] as const

const sfxRows: Row[] = Object.entries(SFX).map(([key, src]) => ({ label: key, src }))

function musicGroup(key: 'GAMEPLAY_LOOP' | 'QUESTION_TICK'): Row[] {
  return MUSIC[key].map((src) => ({
    label: `${key} (${src.endsWith('.ogg') ? 'ogg' : 'mp3 fallback'})`,
    src,
    note: src.endsWith('.ogg') ? 'gapless — what actually ships' : 'Safari fallback; padded, loop gaps',
  }))
}
const musicRows: Row[] = [
  ...musicGroup('GAMEPLAY_LOOP'),
  ...musicGroup('QUESTION_TICK'),
  ...AMBIENCE.APPLAUSE.map((src) => ({
    label: `APPLAUSE (${src.endsWith('.ogg') ? 'ogg' : 'mp3 fallback'})`,
    src,
    note: 'ambience layer — plays alongside music',
  })),
]

const voiceRows: Row[] = [
  { label: 'WELCOME', src: voiceLine(VOICE.WELCOME, locale.value) },
  ...[2, 3, 4, 5, 6].map((n) => ({
    label: `players_${n}`,
    src: voiceLine(VOICE.PLAYER_INTRO, locale.value, { key: `players_${n}` }),
    note: `${n} players`,
  })),
  ...GENERIC_PLAYER_INTRO_KEYS.map((key) => ({
    label: key,
    src: voiceLine(VOICE.PLAYER_INTRO, locale.value, { key }),
    note: 'any roster',
  })),
  ...VERDICT_CORRECT_KEYS.map((key) => ({
    label: key,
    src: voiceLine(VOICE.VERDICT, locale.value, { key }),
    note: 'after a correct answer',
  })),
  ...VERDICT_WRONG_KEYS.map((key) => ({
    label: key,
    src: voiceLine(VOICE.VERDICT, locale.value, { key }),
    note: 'after a wrong answer',
  })),
  ...COLOURS.map((c) => ({
    label: `victory_${c}`,
    src: voiceLine(VOICE.VICTORY, locale.value, { key: `victory_${c}` }),
    note: 'winner callout',
  })),
  ...VICTORY_REMARK_KEYS.map((key) => ({
    label: key,
    src: voiceLine(VOICE.VICTORY, locale.value, { key }),
    note: 'follows the callout, any colour',
  })),
  ...COLOURS.flatMap((c) =>
    [1, 2, 3].map((n) => ({
      label: `turn_${c}_${n}`,
      src: voiceLine(VOICE.TRANSITION, locale.value, { key: `turn_${c}_${n}` }),
      note: `turn gate, variant ${n}`,
    })),
  ),
  ...COLOURS.map((c) => ({
    label: `pass_${c}`,
    src: voiceLine(VOICE.TRANSITION, locale.value, { key: `pass_${c}` }),
    note: 'pass gate',
  })),
]

const allRows = [...sfxRows, ...musicRows, ...voiceRows]

/** 'checking' | 'ok' | 'missing', keyed by src. */
const status = ref<Record<string, string>>({})

onMounted(async () => {
  for (const row of allRows) status.value[row.src] = 'checking'
  await Promise.all(
    allRows.map(async (row) => {
      try {
        const res = await fetch(row.src, { method: 'HEAD' })
        // A 200 is not enough: Vite's dev server answers unknown paths with the
        // SPA fallback, so a missing /sfx/correct.mp3 comes back 200 text/html.
        // The content type is what actually distinguishes a real asset.
        const type = res.headers.get('content-type') ?? ''
        status.value[row.src] = res.ok && type.startsWith('audio/') ? 'ok' : 'missing'
      } catch {
        status.value[row.src] = 'missing'
      }
    }),
  )
})

onUnmounted(() => stopAll())

// ─── Playback ──────────────────────────────────────────────────

const log = ref<string[]>([])
function say(message: string) {
  log.value.unshift(`${new Date().toLocaleTimeString()}  ${message}`)
  log.value = log.value.slice(0, 12)
}

function playOne(row: Row) {
  if (voiceRows.includes(row)) {
    audioManager.playVoiceNow(row.src)
    say(`voice: ${row.label}`)
  } else if (musicRows.includes(row)) {
    audioManager.stopMusic()
    void audioManager.startMusic([row.src])
    say(`music: ${row.label} (no fade)`)
  } else {
    audioManager.playSfx(row.src)
    say(`sfx: ${row.label}`)
  }
}

// ─── Behaviour tests ───────────────────────────────────────────

function testFadeIn() {
  audioManager.stopMusic()
  // stopMusic fades over 300ms; wait it out so the restart is not swallowed.
  setTimeout(() => {
    void audioManager.startMusic(MUSIC.GAMEPLAY_LOOP, { fadeInMs: MUSIC_FADE_IN_MS })
    say(`music fading in over ${MUSIC_FADE_IN_MS}ms`)
  }, 350)
}

function testDucking() {
  void audioManager.startMusic(MUSIC.GAMEPLAY_LOOP)
  setTimeout(() => {
    audioManager.playVoiceNow(voiceLine(VOICE.WELCOME, locale.value))
    say('voice over music — music should duck to 15% and recover')
  }, 800)
}

function testSwap() {
  void audioManager.startMusic(MUSIC.GAMEPLAY_LOOP)
  say('gameplay loop — swapping to the question bed in 3s')
  setTimeout(() => {
    void audioManager.startMusic(MUSIC.QUESTION_TICK, { fadeInMs: MUSIC_SWAP_FADE_MS })
    say('crossfaded to the question tick bed')
  }, 3000)
}

/** The full answer-screen sequence: quiet bed, sting, then the remark. */
function testVerdict(correct: boolean) {
  void audioManager.startMusic(MUSIC.GAMEPLAY_LOOP, { volumeScale: QUIET_MUSIC_SCALE })
  audioManager.setMusicScale(QUIET_MUSIC_SCALE, MUSIC_SWAP_FADE_MS)
  audioManager.playSfx(correct ? SFX.CORRECT : SFX.INCORRECT)
  const keys = correct ? VERDICT_CORRECT_KEYS : VERDICT_WRONG_KEYS
  const key = keys[Math.floor(verdictCycle++ % keys.length)] as string
  say(`verdict ${correct ? 'correct' : 'wrong'}: sting + ${key}`)
  setTimeout(
    () => audioManager.playVoiceNow(voiceLine(VOICE.VERDICT, locale.value, { key })),
    VERDICT_REMARK_DELAY_MS,
  )
}
/** Cycles the variants rather than randomising, so you can audition them all. */
let verdictCycle = 0

/** The whole victory stack: quiet music, applause bed, cheer, then the callout. */
function testVictory() {
  void audioManager.startMusic(MUSIC.GAMEPLAY_LOOP, {
    fadeInMs: VICTORY_FADE_MS,
    volumeScale: VICTORY_MUSIC_SCALE,
  })
  audioManager.setMusicScale(VICTORY_MUSIC_SCALE, VICTORY_FADE_MS)
  void audioManager.startAmbience(AMBIENCE.APPLAUSE, { fadeInMs: VICTORY_FADE_MS })
  audioManager.playSfx(SFX.VICTORY_FANFARE)
  const colour = COLOURS[victoryCycle % COLOURS.length] as string
  const remark = VICTORY_REMARK_KEYS[victoryCycle % VICTORY_REMARK_KEYS.length] as string
  victoryCycle++
  say(`victory: cheer + applause + victory_${colour} -> ${remark}`)
  setTimeout(() => {
    audioManager.playVoiceNow(voiceLine(VOICE.VICTORY, locale.value, { key: `victory_${colour}` }))
    audioManager.enqueueVoice(voiceLine(VOICE.VICTORY, locale.value, { key: remark }))
  }, VICTORY_LINE_DELAY_MS)
}
let victoryCycle = 0

function testJitter() {
  say(`10 rapid clicks at ±${Math.round(CLICK_PITCH_JITTER * 100)}% pitch`)
  for (let i = 0; i < 10; i++) {
    setTimeout(
      () => audioManager.playSfx(SFX.BUTTON_TAP, { pitchJitter: CLICK_PITCH_JITTER }),
      i * 90,
    )
  }
}

function testJitterOff() {
  say('10 rapid clicks, no jitter — compare with the above')
  for (let i = 0; i < 10; i++) {
    setTimeout(() => audioManager.playSfx(SFX.BUTTON_TAP), i * 90)
  }
}

function stopAll() {
  audioManager.stopMusic()
  audioManager.stopAmbience()
  audioManager.clearQueue()
  say('stopped everything')
}
</script>

<template>
  <div class="at">
    <header class="at-head">
      <h1>Audio test bench</h1>
      <p>
        Everything routes through <code>audioManager</code>, so ducking, pitch jitter and
        fades behave exactly as in game. Locale: <strong>{{ locale }}</strong>.
      </p>
      <p class="at-warn">
        Every button here also fires the global UI click, since that is wired to all
        buttons — expect a click before each sound.
      </p>
    </header>

    <section>
      <h2>Behaviour</h2>
      <div class="at-actions">
        <button @click="testFadeIn">Music: {{ MUSIC_FADE_IN_MS }}ms fade-in</button>
        <button @click="testDucking">Voice over music (duck)</button>
        <button @click="testSwap">Swap loop &rarr; tick (crossfade)</button>
        <button @click="testVerdict(true)">Verdict: correct (sting + remark)</button>
        <button @click="testVerdict(false)">Verdict: wrong (sting + remark)</button>
        <button @click="testVictory">Victory (cheer + applause + callout)</button>
        <button @click="testJitter">10 clicks — jitter on</button>
        <button @click="testJitterOff">10 clicks — jitter off</button>
        <button class="at-stop" @click="stopAll">Stop all</button>
      </div>
    </section>

    <section v-for="group in [
      { title: 'Sound effects', rows: sfxRows },
      { title: 'Music', rows: musicRows },
      { title: 'Voice lines', rows: voiceRows },
    ]" :key="group.title">
      <h2>{{ group.title }}</h2>
      <div class="at-row" v-for="row in group.rows" :key="row.src">
        <button
          class="at-play"
          :disabled="status[row.src] === 'missing'"
          @click="playOne(row)"
        >▶</button>
        <span class="at-label">{{ row.label }}</span>
        <span class="at-src">{{ row.src }}</span>
        <span v-if="row.note" class="at-note">{{ row.note }}</span>
        <span class="at-status" :class="'is-' + status[row.src]">
          {{ status[row.src] === 'ok' ? '' : status[row.src] === 'missing' ? 'MISSING' : '…' }}
        </span>
      </div>
    </section>

    <section>
      <h2>Log</h2>
      <pre class="at-log">{{ log.join('\n') || 'nothing yet' }}</pre>
    </section>
  </div>
</template>

<style scoped>
.at {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: #14121c;
  color: #e8e4f0;
  /* style.css locks the app with `overflow: hidden` on html/body (it is a
     fullscreen tablet game), so this page cannot scroll the document. It scrolls
     inside itself instead: a fixed 100dvh box with its own overflow. */
  height: 100dvh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 24px;
  padding-bottom: 64px;
  font-size: 13px;
  box-sizing: border-box;
}
.at-head h1 { margin: 0 0 6px; font-size: 20px; }
.at-head p { margin: 0 0 4px; color: #a49dbb; }
.at-warn { color: #d8a657 !important; }
h2 {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8f87a8;
  margin: 26px 0 8px;
  border-bottom: 1px solid #2a2637;
  padding-bottom: 5px;
}
.at-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.at-actions button {
  background: #2c2740;
  color: #e8e4f0;
  border: 1px solid #423a5e;
  border-radius: 6px;
  padding: 9px 13px;
  font: inherit;
  cursor: pointer;
}
.at-actions button:hover { background: #3a3354; }
.at-stop { background: #4a1f2c !important; border-color: #7a3348 !important; }
.at-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  border-bottom: 1px solid #201c2c;
}
.at-play {
  background: #35c184;
  color: #10240f;
  border: 0;
  border-radius: 5px;
  width: 30px;
  height: 26px;
  cursor: pointer;
  font-size: 12px;
  flex: none;
}
.at-play:disabled { background: #3a3548; color: #6d6683; cursor: not-allowed; }
.at-label { min-width: 190px; font-weight: 700; }
.at-src { color: #7d7694; flex: 1; }
.at-note { color: #6f88b8; font-style: italic; }
.at-status { min-width: 70px; text-align: right; }
.is-missing { color: #e06c75; font-weight: 700; }
.is-checking { color: #6d6683; }
.at-log {
  background: #0e0c14;
  border: 1px solid #2a2637;
  border-radius: 6px;
  padding: 10px;
  color: #a49dbb;
  max-height: 200px;
  overflow: auto;
  margin: 0;
}
</style>
