<script setup lang="ts">
/**
 * The mount point, and nothing else.
 *
 * `App.vue` stays the game's own root — it owns the music lifecycle, the
 * overlays and the screen for the current `GameState`. This sits above it only
 * so the editor at /admin can be a sibling rather than a branch inside the
 * game's render.
 */
</script>

<template>
  <RouterView />
</template>
