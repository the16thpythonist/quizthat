<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import L from 'leaflet'
import type { MapLocationAnswerData, QuestionData } from '../types/session'
import { gradeAnswer } from '../engine/algorithms'

const props = withDefaults(defineProps<{
  answerData: MapLocationAnswerData
  /**
   * Whether a wrong guess may show where the answer actually was. False while
   * the question is still going to be passed to another player.
   */
  revealOnWrong?: boolean
}>(), {
  revealOnWrong: true,
})

/**
 * The pin the player dropped. The parent decides what it is worth — this
 * component only needs the verdict to colour the marker and to know whether it
 * may reveal the target.
 */
const emit = defineEmits<{
  answer: [point: [number, number]]
}>()

const mapContainer = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let answered = false
let resizeObserver: ResizeObserver | null = null

/**
 * Ask the engine, rather than deciding here.
 *
 * This is display only — it picks the marker colour and gates the reveal. The
 * store grades the same pin again for the actual verdict, so the two can never
 * disagree: there is one implementation. This component used to carry its own
 * copy of haversineKm and its own pass mark.
 */
function isHit(lat: number, lng: number): boolean {
  const question = {
    question_type: 'map_location',
    answer_data: props.answerData,
    teaser_title: '',
    question_text: '',
    hint: null,
  } satisfies QuestionData
  return gradeAnswer(question, { type: 'map_location', point: [lat, lng] })
}

onMounted(() => {
  if (!mapContainer.value) return

  map = L.map(mapContainer.value, {
    center: [20, 0],
    zoom: 2,
    zoomControl: false,
    attributionControl: false,
  })

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
  }).addTo(map)

  // Leaflet measures its container once, on creation. Inside a flex column that
  // happens before the row has been given its height, so without this the map
  // renders at the wrong size and leaves a gap below it.
  void nextTick(() => map?.invalidateSize())
  resizeObserver = new ResizeObserver(() => map?.invalidateSize())
  resizeObserver.observe(mapContainer.value)

  map.on('click', (e: L.LeafletMouseEvent) => {
    if (answered || !map) return
    answered = true

    const { lat, lng } = e.latlng
    const target = props.answerData.target
    const correct = isHit(lat, lng)

    // Show user's click
    L.circleMarker([lat, lng], {
      radius: 8,
      color: correct ? '#22c55e' : '#ef4444',
      fillColor: correct ? '#22c55e' : '#ef4444',
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map)

    // A wrong guess that is about to be passed on must not give the answer
    // away; show only where they tapped, then hand over.
    if (!correct && !props.revealOnWrong) {
      setTimeout(() => emit('answer', [lat, lng]), 900)
      return
    }

    // After delay, show target + line, then emit
    setTimeout(() => {
      if (!map) return

      // Target marker
      L.circleMarker([target.lat, target.lng], {
        radius: 10,
        color: '#facc15',
        fillColor: '#facc15',
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map)

      // Line from click to target
      L.polyline([[lat, lng], [target.lat, target.lng]], {
        color: 'rgba(255, 255, 255, 0.4)',
        weight: 2,
        dashArray: '6, 8',
      }).addTo(map)

      // Fit both points in view
      const bounds = L.latLngBounds([[lat, lng], [target.lat, target.lng]])
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 8 })

      setTimeout(() => {
        emit('answer', [lat, lng])
      }, 1200)
    }, 800)
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <!-- Fills its frame: the parent is a flex row, and min-height:0 lets this
       shrink below its content so the map really reaches the bottom edge. -->
  <div ref="mapContainer" class="qt-map-canvas"></div>
</template>
