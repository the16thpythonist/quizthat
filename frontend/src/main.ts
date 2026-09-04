import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import RootApp from './RootApp.vue'
import { router } from './router'
import './style.css'
import en from './i18n/en.json'
import de from './i18n/de.json'
import { setupAutoSaveListeners } from './stores/persistence'
import { useCorpusStore } from './stores/corpus'
import { useGameStore } from './stores/game'

/**
 * The stored language, read before the app mounts so the first paint is already
 * in the right language. Read directly rather than through the settings store,
 * which needs Pinia to exist first.
 */
function storedLocale(): 'de' | 'en' {
  try {
    const raw = localStorage.getItem('quizthat.settings')
    if (raw && JSON.parse(raw).language === 'en') return 'en'
  } catch {
    // storage unavailable — fall through to the default
  }
  return 'de'
}

const i18n = createI18n({
  legacy: false,
  // German is the project's default; English stays available as fallback.
  locale: storedLocale(),
  fallbackLocale: 'en',
  messages: { en, de },
})

const app = createApp(RootApp)
app.use(createPinia())
app.use(i18n)
app.use(router)
app.mount('#app')

/**
 * The game's startup, skipped for the curator's editor.
 *
 * The editor has no session to restore and reads the corpus through its own
 * authenticated API, so running these there would mean a pointless fetch and a
 * "resume your game?" prompt on a page with no game on it.
 */
if (!window.location.pathname.startsWith('/admin')) {
  setupAutoSaveListeners()

  const corpus = useCorpusStore()
  corpus.loadCorpus().catch(err => {
    console.error('Failed to load corpus:', err)
  })

  // An interrupted game is offered on the title screen, not adopted outright.
  useGameStore().checkForResumableGame()
}
