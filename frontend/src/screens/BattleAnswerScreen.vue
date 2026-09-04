<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import L from 'leaflet'
import { useGameStore } from '../stores/game'
import { useActions } from '../composables/useActions'
import GameBar from '../components/GameBar.vue'
import PlayerStrip from '../components/PlayerStrip.vue'
import type { EstimationAnswerData } from '../types/session'

/**
 * One player's battle answer.
 *
 * The map deliberately gives no feedback at all — no target, no distance, not
 * even whether the pin is close. Showing any of that would hand the answer to
 * everyone still waiting for the device.
 */
const { t } = useI18n()
const game = useGameStore()
const act = useActions()

const player = computed(() => game.battlePlayer)
const question = computed(() => game.currentQuestion)
const isMap = computed(() => game.battle?.question_type === 'battle_map')

const unit = computed(() =>
  question.value && !isMap.value
    ? (question.value.answer_data as EstimationAnswerData).unit
    : '',
)

// --- estimation ---
const input = ref('')
const CALC_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', 'backspace']

function press(key: string) {
  if (key === 'backspace') input.value = input.value.slice(0, -1)
  else input.value += key
}

function submitNumber() {
  const value = parseFloat(input.value.replace(',', '.'))
  if (Number.isNaN(value)) return
  act.submitBattleAnswer(value)
}

// --- map ---
const mapContainer = ref<HTMLDivElement | null>(null)
const pin = ref<[number, number] | null>(null)
let map: L.Map | null = null
let marker: L.CircleMarker | null = null
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!isMap.value || !mapContainer.value) return
  map = L.map(mapContainer.value, {
    center: [20, 0], zoom: 2, zoomControl: false, attributionControl: false,
  })
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
  }).addTo(map)
  void Promise.resolve().then(() => map?.invalidateSize())
  resizeObserver = new ResizeObserver(() => map?.invalidateSize())
  resizeObserver.observe(mapContainer.value)

  map.on('click', (e: L.LeafletMouseEvent) => {
    if (!map) return
    pin.value = [e.latlng.lat, e.latlng.lng]
    // the pin can be moved until it is confirmed — nothing is revealed either way
    if (marker) marker.remove()
    marker = L.circleMarker(e.latlng, {
      radius: 9, color: '#fff', fillColor: '#E8705F', fillOpacity: 0.95, weight: 3,
    }).addTo(map)
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  map?.remove()
  map = null
})

function submitPin() {
  if (pin.value) act.submitBattleAnswer(pin.value)
}
</script>

<template>
  <div class="qt-screen">
    <GameBar />
    <PlayerStrip :player="player" :context="t('battle.title')" />

    <div v-if="question" class="qt-panel qt-doodles qt-doodles--ink">
      <div v-if="question.teaser_title" class="qt-teaser">{{ question.teaser_title }}</div>
      <div class="qt-qtext">{{ question.question_text }}</div>
    </div>

    <!-- estimation -->
    <div v-if="!isMap" class="qt-calc-wrap">
      <div class="qt-calc-display">
        <span class="qt-calc-value">{{ input || '0' }}</span>
        <span class="qt-calc-unit">{{ unit }}</span>
      </div>
      <div class="qt-keypad">
        <button
          v-for="key in CALC_KEYS"
          :key="key"
          class="qt-key"
          :class="key === 'backspace' ? 'qt-key--del' : ''"
          @click="press(key)"
        >{{ key === 'backspace' ? '⌫' : key }}</button>
      </div>
      <button class="qt-cta qt-cta--accent" :disabled="!input" @click="submitNumber">
        {{ t('battle.submit') }}
      </button>
    </div>

    <!-- map placement -->
    <div v-else class="qt-map-wrap">
      <div class="qt-map-frame"><div ref="mapContainer" class="qt-map-canvas"></div></div>
      <button class="qt-cta qt-cta--accent qt-map-cta" :disabled="!pin" @click="submitPin">
        {{ pin ? t('battle.submit') : t('battle.dropPin') }}
      </button>
    </div>
  </div>
</template>
