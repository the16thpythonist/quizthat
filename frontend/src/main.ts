import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import './style.css'
import en from './i18n/en.json'
import de from './i18n/de.json'
import { setupAutoSaveListeners } from './stores/persistence'
import { useCorpusStore } from './stores/corpus'

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

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.mount('#app')

setupAutoSaveListeners()

const corpus = useCorpusStore()
corpus.loadCorpus().catch(err => {
  console.error('Failed to load corpus:', err)
})
