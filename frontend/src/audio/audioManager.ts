import { Howl, Howler } from 'howler'
import { GameRng } from '../engine/rng'

// ─── Types ──────────────────────────────────────────────────────

export interface AudioSettings {
  masterVolume: number // 0.0 - 1.0
  musicVolume: number // 0.0 - 1.0
  voiceVolume: number // 0.0 - 1.0
  muted: boolean
  musicEnabled: boolean
  sfxEnabled: boolean
  /** Narrated question and answer lines. Off means they are never queued. */
  voiceEnabled: boolean
}

interface QueueEntry {
  src: string
  onEnd?: () => void
}

// ─── Constants ──────────────────────────────────────────────────

const SKIP_FADE_MS = 200
const DUCK_VOLUME = 0.15 // music volume during voice playback
const DUCK_FADE_MS = 300
const QUEUE_GAP_MS = 200 // pause between sequential voice lines

// ─── Audio Manager ──────────────────────────────────────────────

class AudioManager {
  /**
   * Suppresses stings and voice lines without touching the player's settings.
   *
   * A device watching somebody else's turn renders the real screens, and those
   * screens play their own audio on mount. That is exactly what a television
   * should do — but four phones in the same room, each a beat out of step with
   * the others, is unlistenable. So the phones mirror silently and the TV does
   * not.
   *
   * Music is deliberately unaffected: the bed belongs to the room, and cutting
   * it every time a player's turn ended would be worse than leaving it.
   */
  private silenced = false

  setSilenced(silenced: boolean): void {
    this.silenced = silenced
    if (silenced) this.clearQueue()
  }

  private settings: AudioSettings = {
    masterVolume: 0.8,
    musicVolume: 0.5,
    voiceVolume: 1.0,
    muted: false,
    musicEnabled: true,
    sfxEnabled: true,
    voiceEnabled: true,
  }

  // Voice playback queue
  private queue: QueueEntry[] = []
  private currentVoice: Howl | null = null
  private isPlaying = false

  // Background music
  private bgMusic: Howl | null = null
  private currentMusicSrc: string | null = null
  private isDucked = false
  /**
   * Extra multiplier on music volume, independent of the user's music setting
   * and of voice ducking. Lets a screen run the same track as a quiet bed
   * without touching the player's preference.
   */
  private musicScale = 1

  /**
   * Second looping layer, independent of the music track.
   *
   * Exists because the victory screen wants the gameplay loop AND an applause
   * bed at the same time, and bgMusic holds exactly one Howl. Ambience is not
   * ducked under voice lines: applause continuing under the narrator is right,
   * where music continuing under them is not.
   */
  private ambience: Howl | null = null
  private ambienceSrc: string | null = null

  // SFX cache
  private sfxCache = new Map<string, Howl>()
  // Sources that failed to load (slot has no file yet) — never retried.
  private sfxUnavailable = new Set<string>()

  // Resolves once the browser actually permits playback (see whenAudible).
  private audiblePromise: Promise<void> | null = null

  /**
   * Cosmetic randomness for click pitch. Uses the seeded PRNG rather than
   * Math.random() per the project rule; it is deliberately its own instance so
   * that auditory garnish never advances the game's session RNG and changes
   * which questions or peg placements a seed produces.
   */
  private uiRng = new GameRng(Date.now())

  // ─── Settings ─────────────────────────────────────────────────

  updateSettings(newSettings: Partial<AudioSettings>): void {
    Object.assign(this.settings, newSettings)
    Howler.volume(this.settings.muted ? 0 : this.settings.masterVolume)
    if (this.bgMusic) {
      this.bgMusic.volume(this.effectiveMusicVolume())
    }
    // A line already in the air should follow the slider rather than finish at
    // the old volume.
    if (this.currentVoice) {
      this.currentVoice.volume(this.settings.voiceVolume)
    }
    if (!this.settings.voiceEnabled) {
      this.clearQueue()
      this.skipCurrent()
    }
  }

  getSettings(): AudioSettings {
    return { ...this.settings }
  }

  private effectiveMusicVolume(): number {
    const base = this.settings.musicVolume * this.musicScale
    return this.isDucked ? base * DUCK_VOLUME : base
  }

  /**
   * Fade the music to a fraction of its normal level (1 = normal).
   *
   * Separate from startMusic() because the track usually does not change: the
   * answer screen wants the loop it is already playing, only quieter, and
   * startMusic() is a no-op when the source is unchanged.
   */
  setMusicScale(scale: number, fadeMs = DUCK_FADE_MS): void {
    if (this.musicScale === scale) return
    this.musicScale = scale
    if (this.bgMusic) {
      this.bgMusic.fade(this.bgMusic.volume(), this.effectiveMusicVolume(), fadeMs)
    }
  }

  // ─── Autoplay Unlock ──────────────────────────────────────────

  /**
   * Resolves once the browser actually permits audio playback.
   *
   * Browsers start the AudioContext suspended until the user interacts with the
   * page, and a `play()` issued while suspended is silently queued rather than
   * refused — so anything timed against it (a fade, a voice line scheduled after
   * one) would run against silence and be over before the user ever hears it.
   * Awaiting this first keeps the intro sequence intact: it fires now if audio
   * is already unlocked, otherwise on the first user gesture.
   *
   * Howler creates its AudioContext lazily on the first Howl, so this reports
   * "audible" when no context exists yet — call it once some audio has been
   * constructed, as startMusic() does.
   */
  whenAudible(): Promise<void> {
    if (!Howler.ctx || Howler.ctx.state === 'running') return Promise.resolve()
    if (this.audiblePromise) return this.audiblePromise

    this.audiblePromise = new Promise<void>((resolve) => {
      const events = ['pointerdown', 'touchstart', 'keydown'] as const
      const onGesture = () => {
        for (const ev of events) document.removeEventListener(ev, onGesture)
        // resume() rejects in some browsers if already running; either way we
        // are past the gate by the time a gesture has landed.
        const ctx = Howler.ctx
        if (ctx && ctx.state !== 'running') {
          ctx.resume().then(() => resolve(), () => resolve())
        } else {
          resolve()
        }
      }
      for (const ev of events) {
        document.addEventListener(ev, onGesture, { passive: true })
      }
    })
    return this.audiblePromise
  }

  // ─── Voice Line Queue ─────────────────────────────────────────

  /**
   * Add a voice line to the sequential playback queue.
   * Lines play one after another with brief pauses.
   */
  enqueueVoice(src: string, onEnd?: () => void): void {
    // Dropped rather than queued-and-muted, so the callback still fires and
    // anything sequenced behind the line is not left waiting on silence.
    if (!this.settings.voiceEnabled || this.silenced) {
      onEnd?.()
      return
    }
    this.queue.push({ src, onEnd })
    if (!this.isPlaying) {
      this.playNext()
    }
  }

  /**
   * Enqueue multiple voice lines for sequential playback.
   */
  enqueueMultiple(srcs: string[]): void {
    if (!this.settings.voiceEnabled) return
    for (const src of srcs) {
      this.queue.push({ src })
    }
    if (!this.isPlaying) {
      this.playNext()
    }
  }

  /**
   * Interrupt whatever is speaking and say this instead.
   *
   * Use when a new line makes the queued ones obsolete — e.g. the player starts
   * a game while the title-screen welcome is still running. Note this is not
   * `clearQueue()` followed by `enqueueVoice()`: clearQueue leaves `isPlaying`
   * true until its fade-out timer fires and never calls `playNext()`, so a line
   * queued straight after it would sit there unplayed.
   */
  playVoiceNow(src: string): void {
    if (!this.settings.voiceEnabled || this.silenced) return
    this.queue = [{ src }]
    if (this.currentVoice) {
      // Fades out, then playNext() picks up the entry above.
      this.skipCurrent()
    } else if (!this.isPlaying) {
      this.playNext()
    }
    // isPlaying && !currentVoice means we are inside the inter-line gap; the
    // pending playNext() will collect the new entry on its own.
  }

  /**
   * Skip the currently playing voice line with a 200ms fade-out.
   */
  skipCurrent(): void {
    if (this.currentVoice) {
      this.currentVoice.fade(
        this.currentVoice.volume(),
        0,
        SKIP_FADE_MS,
      )
      setTimeout(() => {
        this.currentVoice?.stop()
        this.currentVoice = null
        this.playNext()
      }, SKIP_FADE_MS)
    }
  }

  /**
   * Clear the queue and stop current playback.
   */
  clearQueue(): void {
    this.queue = []
    if (this.currentVoice) {
      this.currentVoice.fade(
        this.currentVoice.volume(),
        0,
        SKIP_FADE_MS,
      )
      setTimeout(() => {
        this.currentVoice?.stop()
        this.currentVoice = null
        this.isPlaying = false
        this.unduckMusic()
      }, SKIP_FADE_MS)
    } else {
      this.isPlaying = false
      this.unduckMusic()
    }
  }

  private playNext(): void {
    const entry = this.queue.shift()
    if (!entry) {
      this.isPlaying = false
      this.unduckMusic()
      return
    }

    this.isPlaying = true
    this.duckMusic()

    this.currentVoice = new Howl({
      src: [entry.src],
      format: ['mp3'],
      volume: this.settings.voiceVolume,
      onend: () => {
        entry.onEnd?.()
        this.currentVoice = null
        // Brief pause between lines
        setTimeout(() => this.playNext(), QUEUE_GAP_MS)
      },
      onloaderror: () => {
        // Skip lines that fail to load
        this.currentVoice = null
        this.playNext()
      },
    })
    this.currentVoice.play()
  }

  // ─── Background Music ─────────────────────────────────────────

  /**
   * Start the background music loop.
   *
   * Accepts several sources in preference order (e.g. ogg then mp3); Howler
   * plays the first format the browser supports. Formats are derived from the
   * file extensions rather than hardcoded, so an ogg loop is not silently
   * rejected.
   *
   * Calling this with the same track already playing is a no-op — restarting
   * would audibly jump back to bar 1 on every state change.
   *
   * @param fadeInMs - ramp 0 -> full over this many ms instead of starting at
   *   full volume. The ramp begins only once audio is actually permitted, so a
   *   blocked autoplay delays the fade rather than burning through it silently.
   * @returns resolves once playback has actually started (i.e. after the user's
   *   first gesture, if autoplay was blocked), so callers can sequence against it.
   */
  startMusic(
    src: string | readonly string[],
    { fadeInMs = 0, volumeScale }: { fadeInMs?: number; volumeScale?: number } = {},
  ): Promise<void> {
    if (volumeScale !== undefined) this.musicScale = volumeScale
    const sources = (typeof src === 'string' ? [src] : [...src]) as string[]
    const primary = sources[0]
    if (primary === undefined) return Promise.resolve()

    if (this.bgMusic) {
      if (this.currentMusicSrc === primary) return Promise.resolve()
      // Crossfade rather than cut: swapping the gameplay loop for the question
      // bed mid-game is jarring if the outgoing track simply stops dead.
      const outgoing = this.bgMusic
      const fadeOut = fadeInMs > 0 ? fadeInMs : DUCK_FADE_MS
      outgoing.fade(outgoing.volume(), 0, fadeOut)
      setTimeout(() => outgoing.stop(), fadeOut)
    }

    this.currentMusicSrc = primary
    this.isDucked = false
    const music = new Howl({
      src: sources,
      format: sources.map((s) => s.split('.').pop() ?? 'mp3'),
      loop: true,
      volume: fadeInMs > 0 ? 0 : this.effectiveMusicVolume(),
    })
    this.bgMusic = music

    if (!this.settings.musicEnabled) return Promise.resolve()

    return this.whenAudible().then(() => {
      // A later startMusic()/stopMusic() may have superseded this track while we
      // were waiting for the user's first gesture.
      if (this.bgMusic !== music || !this.settings.musicEnabled) return
      music.play()
      if (fadeInMs > 0) {
        music.fade(0, this.effectiveMusicVolume(), fadeInMs)
      }
    })
  }

  /**
   * Stop background music.
   */
  stopMusic(): void {
    if (this.bgMusic) {
      const music = this.bgMusic
      this.bgMusic = null
      this.currentMusicSrc = null
      this.isDucked = false
      this.musicScale = 1
      music.fade(music.volume(), 0, DUCK_FADE_MS)
      setTimeout(() => music.stop(), DUCK_FADE_MS)
    }
  }

  private duckMusic(): void {
    if (this.bgMusic && !this.isDucked) {
      this.isDucked = true
      this.bgMusic.fade(
        this.bgMusic.volume(),
        this.settings.musicVolume * DUCK_VOLUME,
        DUCK_FADE_MS,
      )
    }
  }

  private unduckMusic(): void {
    if (this.bgMusic && this.isDucked) {
      this.isDucked = false
      this.bgMusic.fade(
        this.bgMusic.volume(),
        this.settings.musicVolume,
        DUCK_FADE_MS,
      )
    }
  }

  // ─── Ambience (second loop layer) ─────────────────────────────

  /** Start a looping ambience bed alongside the music. Idempotent per source. */
  startAmbience(
    src: string | readonly string[],
    { fadeInMs = 0, volume = 0.6 }: { fadeInMs?: number; volume?: number } = {},
  ): Promise<void> {
    const sources = (typeof src === 'string' ? [src] : [...src]) as string[]
    const primary = sources[0]
    if (primary === undefined) return Promise.resolve()
    if (this.ambience && this.ambienceSrc === primary) return Promise.resolve()
    this.stopAmbience(0)

    this.ambienceSrc = primary
    const amb = new Howl({
      src: sources,
      format: sources.map((f) => f.split('.').pop() ?? 'mp3'),
      loop: true,
      volume: fadeInMs > 0 ? 0 : volume,
    })
    this.ambience = amb
    if (!this.settings.sfxEnabled) return Promise.resolve()

    return this.whenAudible().then(() => {
      if (this.ambience !== amb) return
      amb.play()
      if (fadeInMs > 0) amb.fade(0, volume, fadeInMs)
    })
  }

  stopAmbience(fadeMs = DUCK_FADE_MS): void {
    if (!this.ambience) return
    const amb = this.ambience
    this.ambience = null
    this.ambienceSrc = null
    if (fadeMs > 0) {
      amb.fade(amb.volume(), 0, fadeMs)
      setTimeout(() => amb.stop(), fadeMs)
    } else {
      amb.stop()
    }
  }

  // ─── Sound Effects ────────────────────────────────────────────

  /**
   * Play a one-shot sound effect.
   *
   * Most SFX slots have no audio file yet. A missing file is not an error here:
   * the source is recorded as unavailable on the first load failure and skipped
   * from then on, so an unfilled slot stays silent instead of throwing on every
   * turn.
   */
  playSfx(src: string, { pitchJitter = 0 }: { pitchJitter?: number } = {}): void {
    if (!this.settings.sfxEnabled || this.silenced) return
    if (this.sfxUnavailable.has(src)) return

    let sfx = this.sfxCache.get(src)
    if (!sfx) {
      sfx = new Howl({
        src: [src],
        format: [src.split('.').pop() ?? 'mp3'],
        volume: 1.0,
        onloaderror: () => {
          this.sfxUnavailable.add(src)
          this.sfxCache.delete(src)
        },
      })
      this.sfxCache.set(src, sfx)
    }

    const id = sfx.play()
    if (pitchJitter > 0) {
      // Per-instance rate, so overlapping presses each keep their own pitch.
      const spread = (this.uiRng.next() * 2 - 1) * pitchJitter
      sfx.rate(1 + spread, id)
    }
  }

  // ─── Question Audio Lifecycle ─────────────────────────────────

  /**
   * Build the audio path for a question file.
   * @param questionId - Question UUID
   * @param filename - e.g. "teaser", "question", "answer_0"
   * @param language - e.g. "en", "de"
   * @param corpusBaseUrl - Base URL for the corpus server
   */
  questionAudioPath(
    questionId: string,
    filename: string,
    language: string,
    corpusBaseUrl: string,
  ): string {
    return `${corpusBaseUrl}${questionId}/audio/${filename}.${language}.mp3`
  }

  /**
   * Enqueue all audio for a question: teaser title, then question text,
   * then each answer option in sequence.
   */
  enqueueQuestionAudio(
    questionId: string,
    language: string,
    answerCount: number,
    corpusBaseUrl: string,
  ): void {
    const base = (filename: string) =>
      this.questionAudioPath(questionId, filename, language, corpusBaseUrl)

    // Question readout
    this.enqueueVoice(base('question'))

    // Answer options
    for (let i = 0; i < answerCount; i++) {
      this.enqueueVoice(base(`answer_${i}`))
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  /**
   * Stop all audio and clean up resources.
   */
  destroy(): void {
    this.stopAmbience(0)
    this.clearQueue()
    this.stopMusic()
    this.sfxCache.forEach(sfx => sfx.unload())
    this.sfxCache.clear()
  }
}

// ─── Singleton Export ───────────────────────────────────────────

export const audioManager = new AudioManager()
