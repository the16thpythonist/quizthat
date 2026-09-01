import { ref } from 'vue'

/**
 * Open/closed state for the board sheet.
 *
 * Module-level rather than per-component, because the handle that opens it
 * lives in GameBar while the sheet itself is mounted once in App.vue.
 */
const isOpen = ref(false)

export function useBoardSheet() {
  function open() {
    isOpen.value = true
  }
  function close() {
    isOpen.value = false
  }
  function toggle() {
    isOpen.value = !isOpen.value
  }
  return { isOpen, open, close, toggle }
}
