import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import './style.css'
import en from './i18n/en.json'
import de from './i18n/de.json'
import { setupAutoSaveListeners } from './stores/persistence'
import { useCorpusStore } from './stores/corpus'

const i18n = createI18n({
  legacy: false,
  locale: navigator.language.startsWith('de') ? 'de' : 'en',
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
