<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import L from 'leaflet'

/**
 * The map half of a battle reveal: every guess, the true location, and how far
 * each player was off, all in one picture.
 *
 * The rank list underneath states the same distances as numbers; this is what
 * makes them mean something — a 900 km miss on a European question looks very
 * different from 900 km on a Pacific one.
 */
const props = defineProps<{
  target: { lat: number; lng: number }
  guesses: { lat: number; lng: number; color: string; name: string; label: string }[]
}>()

const container = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!container.value) return
  map = L.map(container.value, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
  })
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
  }).addTo(map)

  const target: L.LatLngExpression = [props.target.lat, props.target.lng]

  for (const guess of props.guesses) {
    const at: L.LatLngExpression = [guess.lat, guess.lng]
    L.polyline([at, target], {
      color: guess.color,
      weight: 2,
      opacity: 0.7,
      dashArray: '5, 7',
    }).addTo(map)
    L.circleMarker(at, {
      radius: 7,
      color: '#fff',
      fillColor: guess.color,
      fillOpacity: 0.95,
      weight: 2,
    })
      .addTo(map)
      .bindTooltip(guess.label, { permanent: true, direction: 'top', className: 'qt-map-tip' })
  }

  // The answer goes on last so it sits above every guess marker.
  L.circleMarker(target, {
    radius: 9,
    color: '#3F1263',
    fillColor: '#F0C24B',
    fillOpacity: 1,
    weight: 3,
  }).addTo(map)

  const bounds = L.latLngBounds([target, ...props.guesses.map((g) => [g.lat, g.lng] as L.LatLngExpression)])
  map.fitBounds(bounds, { padding: [46, 46], maxZoom: 6 })

  // Leaflet measures the container on creation, which here happens before the
  // reveal has been laid out; without this the map draws at the wrong size.
  void Promise.resolve().then(() => map?.invalidateSize())
  resizeObserver = new ResizeObserver(() => map?.invalidateSize())
  resizeObserver.observe(container.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  map?.remove()
  map = null
})
</script>

<template>
  <div ref="container" class="qt-result-map"></div>
</template>
