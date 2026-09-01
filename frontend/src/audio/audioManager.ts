import { Howl, Howler } from 'howler'

// ─── Types ──────────────────────────────────────────────────────

export interface AudioSettings {
  masterVolume: number // 0.0 - 1.0
  musicVolume: number // 0.0 - 1.0
  muted: boolean
  musicEnabled: boolean
  sfxEnabled: boolean
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
  private settings: AudioSettings = {
    masterVolume: 0.8,
    musicVolume: 0.5,
    muted: false,
    musicEnabled: true,
    sfxEnabled: true,
  }

  // Voice playback queue
  private queue: QueueEntry[] = []
  private currentVoice: Howl | null = null
  private isPlaying = false

  // Background music
  private bgMusic: Howl | null = null
  private isDucked = false

  // SFX cache
  private sfxCache = new Map<string, Howl>()

  // ─── Settings ─────────────────────────────────────────────────

  updateSettings(newSettings: Partial<AudioSettings>): void {
    Object.assign(this.settings, newSettings)
    Howler.volume(this.settings.muted ? 0 : this.settings.masterVolume)
    if (this.bgMusic) {
      this.bgMusic.volume(this.effectiveMusicVolume())
    }
  }

  getSettings(): AudioSettings {
    return { ...this.settings }
  }

  private effectiveMusicVolume(): number {
    const base = this.settings.musicVolume
    return this.isDucked ? base * DUCK_VOLUME : base
  }

  // ─── Voice Line Queue ─────────────────────────────────────────

  /**
   * Add a voice line to the sequential playback queue.
   * Lines play one after another with brief pauses.
   */
  enqueueVoice(src: string, onEnd?: () => void): void {
    this.queue.push({ src, onEnd })
    if (!this.isPlaying) {
      this.playNext()
    }
  }

  /**
   * Enqueue multiple voice lines for sequential playback.
   */
  enqueueMultiple(srcs: string[]): void {
    for (const src of srcs) {
      this.queue.push({ src })
    }
    if (!this.isPlaying) {
      this.playNext()
    }
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
      volume: 1.0,
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
   * Start background music loop.
   */
  startMusic(src: string): void {
    if (this.bgMusic) {
      this.bgMusic.stop()
    }
    this.bgMusic = new Howl({
      src: [src],
      format: ['mp3'],
      loop: true,
      volume: this.effectiveMusicVolume(),
    })
    if (this.settings.musicEnabled) {
      this.bgMusic.play()
    }
  }

  /**
   * Stop background music.
   */
  stopMusic(): void {
    if (this.bgMusic) {
      this.bgMusic.fade(this.bgMusic.volume(), 0, DUCK_FADE_MS)
      setTimeout(() => {
        this.bgMusic?.stop()
        this.bgMusic = null
      }, DUCK_FADE_MS)
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

  // ─── Sound Effects ────────────────────────────────────────────

  /**
   * Play a one-shot sound effect.
   */
  playSfx(src: string): void {
    if (!this.settings.sfxEnabled) return

    let sfx = this.sfxCache.get(src)
    if (!sfx) {
      sfx = new Howl({
        src: [src],
        format: ['mp3'],
        volume: 1.0,
      })
      this.sfxCache.set(src, sfx)
    }
    sfx.play()
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
    this.clearQueue()
    this.stopMusic()
    this.sfxCache.forEach(sfx => sfx.unload())
    this.sfxCache.clear()
  }
}

// ─── Singleton Export ───────────────────────────────────────────

export const audioManager = new AudioManager()
