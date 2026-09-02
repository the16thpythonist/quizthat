<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSettingsSheet } from '../composables/useSettingsSheet'
import SettingsPanel from './SettingsPanel.vue'

/** Settings over a running game, so volume can be fixed without losing the session. */
const { t } = useI18n()
const sheet = useSettingsSheet()
</script>

<template>
  <template v-if="sheet.isOpen.value">
    <div class="qt-backdrop" @click="sheet.close()"></div>
    <div class="qt-sheet qt-sheet--up qt-sheet--tall">
      <div class="qt-sheet-title">{{ t('settings.title') }}</div>
      <div class="qt-settings-list">
        <SettingsPanel />
      </div>
      <div class="qt-sheet-foot">
        <button class="qt-cta qt-cta--accent" @click="sheet.close()">{{ t('setup.expertiseDone') }}</button>
      </div>
    </div>
  </template>
</template>
