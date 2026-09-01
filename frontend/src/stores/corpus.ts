import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { QuestionMeta, QuestionData } from '../types/session'

export const useCorpusStore = defineStore('corpus', () => {
  const questions = ref<QuestionMeta[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)

  const corpusBaseUrl = computed(() => '/corpus/')

  async function loadCorpus(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      const url = `${corpusBaseUrl.value}corpus-index.json`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch corpus index: ${response.status}`)
      const data = await response.json()
      questions.value = data.questions.map((q: Record<string, unknown>) => ({
        id: q.id,
        languages: q.languages,
        major_category: q.major_category,
        subcategory: q.subcategory,
        difficulty: q.difficulty,
        question_type: q.question_type,
        time_limit_seconds: q.time_limit_seconds,
        version: 1,
        created_at: '',
        generation_batch: null,
      }))
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchTeaserTitle(questionId: string, language: string): Promise<string> {
    try {
      const url = `${corpusBaseUrl.value}${questionId}/question.${language}.json`
      const response = await fetch(url)
      if (!response.ok) return ''
      const data = await response.json()
      return data.teaser_title ?? ''
    } catch {
      return ''
    }
  }

  async function fetchQuestionData(questionId: string, language: string): Promise<QuestionData | null> {
    try {
      const url = `${corpusBaseUrl.value}${questionId}/question.${language}.json`
      const response = await fetch(url)
      if (!response.ok) return null
      const data = await response.json()
      const meta = questions.value.find((q) => q.id === questionId)
      return {
        teaser_title: data.teaser_title ?? '',
        question_text: data.question_text ?? '',
        hint: data.hint ?? null,
        answer_data: data.answer_data,
        question_type: meta?.question_type ?? 'multiple_choice',
      }
    } catch {
      return null
    }
  }

  return { questions, loading, error, loaded, corpusBaseUrl, loadCorpus, fetchTeaserTitle, fetchQuestionData }
})
