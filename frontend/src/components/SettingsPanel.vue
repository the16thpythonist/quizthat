<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings'
import { useGameStore } from '../stores/game'
import { useActions } from '../composables/useActions'
import { useSettingsSheet } from '../composables/useSettingsSheet'
import type { UiLanguage } from '../stores/settings'

/**
 * The settings controls themselves, without any chrome.
 *
 * Used both as a full screen from the title and as a sheet over play, so it
 * carries no header or close button of its own.
 */
const { t, locale } = useI18n()
const settings = useSettingsStore()
const game = useGameStore()
const act = useActions()
const sheet = useSettingsSheet()

const s = computed(() => settings.settings)

/** Percent for display; the store keeps 0..1. */
function pct(value: number): number {
  return Math.round(value * 100)
}

function setVolume(key: 'masterVolume' | 'musicVolume' | 'voiceVolume', event: Event) {
  const value = Number((event.target as HTMLInputElement).value) / 100
  settings.set(key, value)
}

/**
 * Language drives both the interface and which language questions are drawn
 * in. Questions already loaded keep the language they were fetched in; the
 * change takes effect from the next question.
 */
function setLanguage(lang: UiLanguage) {
  settings.set('language', lang)
  locale.value = lang
  act.updateSettings({ language: lang })
}

/**
 * Abandoning is destructive and unrecoverable — the session is not kept
 * anywhere — so it asks first, and the confirmation sits above the settings
 * rather than replacing them, so backing out returns you where you were.
 */
const confirmingAbandon = ref(false)

/** Only meaningful mid-game; on the title screen there is nothing to abandon. */
const canAbandon = computed(() => game.status === 'in_progress')

function abandonGame() {
  confirmingAbandon.value = false
  sheet.close()
  game.resetGame()
}

const LANGUAGES: { id: UiLanguage; label: string }[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
]
</script>

<template>
  <!-- Master -->
  <div class="qt-setting">
    <div class="qt-setting-label">{{ t('settings.master') }} · {{ pct(s.masterVolume) }}%</div>
    <input
      class="qt-slider"
      type="range"
      min="0"
      max="100"
      :value="pct(s.masterVolume)"
      @input="setVolume('masterVolume', $event)"
    />
    <button
      class="qt-toggle"
      :class="{ 'is-on': !s.muted }"
      @click="settings.set('muted', !s.muted)"
    >
      <span>{{ t('settings.sound') }}</span>
      <span class="qt-toggle-state">{{ s.muted ? t('settings.off') : t('settings.on') }}</span>
    </button>
  </div>

  <!-- Music -->
  <div class="qt-setting">
    <div class="qt-setting-label">{{ t('settings.music') }} · {{ pct(s.musicVolume) }}%</div>
    <input
      class="qt-slider"
      type="range"
      min="0"
      max="100"
      :value="pct(s.musicVolume)"
      :disabled="!s.musicEnabled"
      @input="setVolume('musicVolume', $event)"
    />
    <button
      class="qt-toggle"
      :class="{ 'is-on': s.musicEnabled }"
      @click="settings.set('musicEnabled', !s.musicEnabled)"
    >
      <span>{{ t('settings.music') }}</span>
      <span class="qt-toggle-state">{{ s.musicEnabled ? t('settings.on') : t('settings.off') }}</span>
    </button>
  </div>

  <!-- Voice -->
  <div class="qt-setting">
    <div class="qt-setting-label">{{ t('settings.voice') }} · {{ pct(s.voiceVolume) }}%</div>
    <input
      class="qt-slider"
      type="range"
      min="0"
      max="100"
      :value="pct(s.voiceVolume)"
      :disabled="!s.voiceEnabled"
      @input="setVolume('voiceVolume', $event)"
    />
    <button
      class="qt-toggle"
      :class="{ 'is-on': s.voiceEnabled }"
      @click="settings.set('voiceEnabled', !s.voiceEnabled)"
    >
      <span>{{ t('settings.voice') }}</span>
      <span class="qt-toggle-state">{{ s.voiceEnabled ? t('settings.on') : t('settings.off') }}</span>
    </button>
    <p class="qt-setting-note">{{ t('settings.voiceNote') }}</p>
  </div>

  <!-- Sound effects -->
  <div class="qt-setting">
    <div class="qt-setting-label">{{ t('settings.sfx') }}</div>
    <button
      class="qt-toggle"
      :class="{ 'is-on': s.sfxEnabled }"
      @click="settings.set('sfxEnabled', !s.sfxEnabled)"
    >
      <span>{{ t('settings.sfx') }}</span>
      <span class="qt-toggle-state">{{ s.sfxEnabled ? t('settings.on') : t('settings.off') }}</span>
    </button>
  </div>

  <!-- Language -->
  <div class="qt-setting">
    <div class="qt-setting-label">{{ t('settings.language') }}</div>
    <div class="qt-seg">
      <button
        v-for="lang in LANGUAGES"
        :key="lang.id"
        :class="{ 'is-on': s.language === lang.id }"
        @click="setLanguage(lang.id)"
      >{{ lang.label }}</button>
    </div>
    <p class="qt-setting-note">{{ t('settings.languageNote') }}</p>
  </div>

  <!-- Abandon. Last in the list on purpose: it is the one thing here that
       throws work away, and it should not sit next to the volume sliders. -->
  <div v-if="canAbandon" class="qt-setting">
    <div class="qt-setting-label">{{ t('settings.abandon') }}</div>
    <button class="qt-cta qt-cta--danger" @click="confirmingAbandon = true">
      {{ t('settings.abandon') }}
    </button>
    <p class="qt-setting-note">{{ t('settings.abandonNote') }}</p>
  </div>

  <!-- Credits. Font Awesome Free is CC BY 4.0, which requires attribution. -->
  <div class="qt-setting">
    <div class="qt-setting-label">{{ t('settings.credits') }}</div>
    <p class="qt-setting-note">{{ t('settings.creditsIcons') }}</p>
    <p class="qt-setting-note">{{ t('settings.creditsFont') }}</p>
  </div>

  <!--
    Teleported to the body on purpose. Rendered in place it lands inside the
    settings sheet's own stacking context, where its z-index counts only
    against its siblings — so the dimming backdrop sat on top of it and ate
    every click. At the body it is a sibling of the settings sheet instead.
  -->
  <Teleport v-if="confirmingAbandon" to="body">
    <div class="qt-backdrop qt-backdrop--over" @click="confirmingAbandon = false"></div>
    <div class="qt-sheet qt-sheet--up qt-sheet--over">
      <div class="qt-joker-name">{{ t('settings.abandonConfirmTitle') }}</div>
      <p class="qt-joker-desc">{{ t('settings.abandonConfirmBody') }}</p>
      <div class="flex flex-col gap-2.5">
        <button class="qt-cta qt-cta--danger" @click="abandonGame">
          {{ t('settings.abandonConfirm') }}
        </button>
        <button class="qt-cta qt-cta--ghost" @click="confirmingAbandon = false">
          {{ t('joker.cancel') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>
