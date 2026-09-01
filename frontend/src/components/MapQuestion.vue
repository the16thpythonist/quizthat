<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import type { MapLocationAnswerData } from '../types/session'

const props = defineProps<{
  answerData: MapLocationAnswerData
}>()

const emit = defineEmits<{
  answer: [correct: boolean]
}>()

const mapContainer = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let answered = false

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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

  map.on('click', (e: L.LeafletMouseEvent) => {
    if (answered || !map) return
    answered = true

    const { lat, lng } = e.latlng
    const target = props.answerData.target
    const maxRadius = Math.max(...props.answerData.scoring.map(s => s.radius_km))
    const distance = haversineKm(lat, lng, target.lat, target.lng)
    const correct = distance <= maxRadius

    // Show user's click
    L.circleMarker([lat, lng], {
      radius: 8,
      color: correct ? '#22c55e' : '#ef4444',
      fillColor: correct ? '#22c55e' : '#ef4444',
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map)

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
        emit('answer', correct)
      }, 1200)
    }, 800)
  })
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div
    ref="mapContainer"
    class="w-full flex-1 rounded-xl overflow-hidden"
    :style="{
      minHeight: '300px',
      border: '1px solid rgba(255, 255, 255, 0.08)',
    }"
  ></div>
</template>
