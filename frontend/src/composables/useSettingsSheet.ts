import { ref } from 'vue'

/**
 * Open/closed state for the settings sheet.
 *
 * Module-level like useBoardSheet, because the gear that opens it lives in
 * GameBar while the sheet itself is mounted once in App.vue.
 */
const isOpen = ref(false)

export function useSettingsSheet() {
  return {
    isOpen,
    open: () => { isOpen.value = true },
    close: () => { isOpen.value = false },
    toggle: () => { isOpen.value = !isOpen.value },
  }
}
