import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { audioManager } from '../audio/audioManager'
import type { AudioSettings } from '../audio/audioManager'

export type UiLanguage = 'de' | 'en'

export interface AppSettings extends AudioSettings {
  language: UiLanguage
}

const STORAGE_KEY = 'quizthat.settings'

const DEFAULTS: AppSettings = {
  masterVolume: 0.8,
  musicVolume: 0.5,
  voiceVolume: 1.0,
  muted: false,
  musicEnabled: true,
  sfxEnabled: true,
  voiceEnabled: true,
  language: 'de',
}

/**
 * Reads the stored settings, falling back to defaults for anything missing.
 *
 * Deliberately field-by-field rather than a spread of whatever was parsed: a
 * stored blob from an older build could be missing keys or carry stale ones,
 * and a slider bound to undefined breaks silently.
 */
function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const stored = JSON.parse(raw) as Partial<AppSettings>
    return {
      masterVolume: clamp01(stored.masterVolume, DEFAULTS.masterVolume),
      musicVolume: clamp01(stored.musicVolume, DEFAULTS.musicVolume),
      voiceVolume: clamp01(stored.voiceVolume, DEFAULTS.voiceVolume),
      muted: stored.muted ?? DEFAULTS.muted,
      musicEnabled: stored.musicEnabled ?? DEFAULTS.musicEnabled,
      sfxEnabled: stored.sfxEnabled ?? DEFAULTS.sfxEnabled,
      voiceEnabled: stored.voiceEnabled ?? DEFAULTS.voiceEnabled,
      language: stored.language === 'en' ? 'en' : DEFAULTS.language,
    }
  } catch {
    // private mode, corrupt JSON, storage disabled — defaults are fine
    return { ...DEFAULTS }
  }
}

function clamp01(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(load())

  /** Push the audio half into the manager; the language half is read by main.ts. */
  function applyAudio() {
    const { language: _language, ...audio } = settings.value
    audioManager.updateSettings(audio)
  }

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    settings.value[key] = value
  }

  function reset() {
    settings.value = { ...DEFAULTS }
  }

  // Persist and apply on any change. Settings are tiny and changed by hand, so
  // there is nothing to gain from debouncing this.
  watch(
    settings,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // storage unavailable — the session still works, it just will not persist
      }
      applyAudio()
    },
    { deep: true },
  )

  applyAudio()

  return { settings, set, reset, applyAudio }
})
