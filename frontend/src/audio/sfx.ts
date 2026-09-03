/**
 * Sound effect and music file paths.
 *
 * Files live in public/ and are served as static assets, not bundled.
 * Slots whose file does not exist yet are simply silent: audioManager.playSfx()
 * caches the load failure and never retries, so an unfilled slot costs one
 * 404 and nothing else.
 */
export const SFX = {
  CORRECT: '/sfx/correct.mp3',
  INCORRECT: '/sfx/incorrect.mp3',
  // WAV for the same reason as the UI clicks: mp3's ~26ms encoder-delay padding
  // is latency you can feel on a hit that must land with a visual frame.
  PEG_DROP: '/sfx/peg-drop.wav',
  ROULETTE_TICK: '/sfx/roulette-tick.wav',
  /** Suspense swell under the candidate reveal. */
  PEG_RISER: '/sfx/peg-riser.mp3',
  /** Fires when the reveal settles and the candidates are locked in. */
  PEG_LAND: '/sfx/peg-land.wav',
  /** Big crowd cheer on entering the victory screen. */
  VICTORY_FANFARE: '/sfx/victory-fanfare.mp3',
  HEARTBEAT: '/sfx/heartbeat.mp3',
  JOKER_USE: '/sfx/joker-use.mp3',
  // UI clicks ship as WAV, not MP3: mp3 prepends ~26ms of encoder-delay silence,
  // which on a button press is latency you can feel. They are only a few kB.
  CARD_SELECT: '/sfx/card-select.wav',
  BUTTON_TAP: '/sfx/button-tap.wav',
} as const

/**
 * Background music loop.
 *
 * Ogg Vorbis first, deliberately: MP3 cannot loop gaplessly because the format
 * pads every file with encoder delay (~32ms here), which is audible as a hiccup
 * every time the loop wraps. Ogg is sample-exact. The MP3 is only a fallback for
 * browsers without Vorbis support (Safari); Howler picks the first playable one.
 */
export const MUSIC = {
  GAMEPLAY_LOOP: ['/music/quizshow_loop.ogg', '/music/quizshow_loop.mp3'],
  /**
   * Suspense bed while a question is on screen — it replaces the gameplay loop
   * rather than layering, since two rhythmic beds at different tempi fight.
   * Ticks at 99/min over a quiet low drone, cut to a whole number of tick
   * intervals so the rhythm does not stumble at the wrap.
   */
  QUESTION_TICK: ['/music/question-tick.ogg', '/music/question-tick.mp3'],
} as const

/** Looping beds that play alongside the music, on audioManager's ambience layer. */
export const AMBIENCE = {
  APPLAUSE: ['/music/victory-applause.ogg', '/music/victory-applause.mp3'],
} as const

/**
 * UI narrator voice lines — the ones shipped with the app, as opposed to the
 * per-question lines the pipeline generates into the corpus (SPEC §6).
 *
 * Paths are templates carrying a `{lang}` placeholder; resolve them with
 * `voiceLine()` against the active i18n locale. Adding a language is therefore
 * only a matter of dropping `welcome.<lang>.mp3` into public/voice/ — no code
 * change. A language whose file is missing is silent rather than broken:
 * audioManager's voice queue skips entries that fail to load.
 */
export const VOICE = {
  WELCOME: '/voice/welcome.{lang}.mp3',
  /** Roster callout; `{key}` comes from engine's pickPlayerIntroLine(). */
  PLAYER_INTRO: '/voice/{key}.{lang}.mp3',
  /** Remark after an answer; `{key}` comes from engine's pickVerdictRemark(). */
  VERDICT: '/voice/{key}.{lang}.mp3',
  /** Winner callout; `{key}` is `victory_<colour>`. */
  VICTORY: '/voice/{key}.{lang}.mp3',
  /** Turn / pass transition; `{key}` is `turn_<colour>_<n>` or `pass_<colour>`. */
  TRANSITION: '/voice/{key}.{lang}.mp3',
  /** Round-closing battle; `{key}` is `battle_intro_<n>` / `battle_format_<fmt>` / `battle_reveal_<n>`. */
  BATTLE: '/voice/{key}.{lang}.mp3',
} as const

/**
 * Resolve a voice-line template: `{lang}` from the locale, plus any extra
 * placeholders. e.g. voiceLine(VOICE.PLAYER_INTRO, 'de', { key: 'players_2' })
 * -> /voice/players_2.de.mp3
 */
export function voiceLine(
  template: string,
  language: string,
  vars: Record<string, string> = {},
): string {
  let out = template.replace('{lang}', language)
  for (const [name, value] of Object.entries(vars)) {
    out = out.replace(`{${name}}`, value)
  }
  return out
}

/**
 * Random playback-rate spread applied to UI clicks, +/- this fraction. Stops
 * rapid tapping (colour swatches, steppers) sounding like a machine gun.
 */
export const CLICK_PITCH_JITTER = 0.03

/** How long the music takes to reach full volume on the title screen. */
export const MUSIC_FADE_IN_MS = 3000

/** Crossfade when swapping between the gameplay loop and the question bed. */
export const MUSIC_SWAP_FADE_MS = 600

/**
 * Ramp for the gameplay loop on the question-selection screen. Long on purpose:
 * the music should creep in while the player reads the four options, not be
 * there at full level from the first frame.
 */
export const SELECTION_RAMP_MS = 4000

/** Music level on the answer screen — present, but well out of the way. */
export const QUIET_MUSIC_SCALE = 0.15

/** Music level under the victory celebration — the applause is the focus. */
export const VICTORY_MUSIC_SCALE = 0.25

/** How long the celebration takes to arrive after the screen appears. */
export const VICTORY_FADE_MS = 800

/** Gap before the narrator names the winner, so the cheer lands first. */
export const VICTORY_LINE_DELAY_MS = 1800

/**
 * Pitch spread on the reveal rattle. Wider than the UI clicks: this fires a
 * dozen times in one second, so identical hits read as a machine gun.
 */
export const RATTLE_PITCH_JITTER = 0.09

/**
 * Gap between the verdict sting and the narrator's remark, so the cheer or the
 * trombone finishes its thought before anyone speaks over it.
 */
export const VERDICT_REMARK_DELAY_MS = 900

/**
 * Delay before the narrator starts reading the question, so the screen has
 * settled and the tick bed has established before anyone speaks.
 */
export const QUESTION_READ_DELAY_MS = 500
