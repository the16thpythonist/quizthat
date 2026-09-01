<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGameStore } from './stores/game'
import { screenForState } from './engine/screenMap'
import BoardViewerOverlay from './components/BoardViewerOverlay.vue'
import AnimationTestScreen from './screens/AnimationTestScreen.vue'

const game = useGameStore()
const currentScreen = computed(() => screenForState(game.state))

const isTestRoute = ref(window.location.hash === '#test-board')

function onHashChange() {
  isTestRoute.value = window.location.hash === '#test-board'
}

onMounted(() => window.addEventListener('hashchange', onHashChange))
onUnmounted(() => window.removeEventListener('hashchange', onHashChange))
</script>

<template>
  <AnimationTestScreen v-if="isTestRoute" />
  <template v-else>
    <component :is="currentScreen" />
    <BoardViewerOverlay />
  </template>
</template>
