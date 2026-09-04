<script setup lang="ts">
/**
 * The one login in QuizThat.
 *
 * Playing needs no account; editing does, because these files are what every
 * game draws from. If the server has no password configured it says so instead
 * of offering a form — a misconfigured editor should fail loudly rather than
 * look like a wrong password.
 */
import { ref } from 'vue'
import { useAdminStore, messageFor } from './store'

const admin = useAdminStore()
const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = null
  try {
    await admin.signIn(username.value, password.value)
  } catch (err) {
    error.value = messageFor(err)
    password.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="grid flex-1 place-items-center px-6">
    <div v-if="!admin.configured" class="glass-card max-w-md rounded-lg p-6 text-sm">
      <h2 class="mb-2 text-base font-semibold text-white">No editor password is set</h2>
      <p class="mb-3 text-slate-400">
        The editor refuses to open rather than leaving the corpus writable by anyone who can
        reach this server. Put a password in the repo-root <code>.env</code> and restart:
      </p>
      <pre class="rounded bg-black/40 p-3 text-xs text-slate-300">QUIZTHAT_ADMIN_USER=…
QUIZTHAT_ADMIN_PASSWORD=…</pre>
    </div>

    <form v-else class="glass-card w-full max-w-sm rounded-lg p-6" @submit.prevent="submit">
      <h2 class="mb-1 text-base font-semibold text-white">Sign in to edit</h2>
      <p class="mb-5 text-xs text-slate-500">
        One shared login for whoever curates the questions.
      </p>

      <label class="mb-3 block">
        <span class="mb-1 block text-xs uppercase tracking-wide text-slate-500">Username</span>
        <input
          v-model="username"
          autocomplete="username"
          class="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm
                 outline-none focus:border-white/30"
        />
      </label>

      <label class="mb-4 block">
        <span class="mb-1 block text-xs uppercase tracking-wide text-slate-500">Password</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm
                 outline-none focus:border-white/30"
        />
      </label>

      <p v-if="error" class="mb-3 text-sm text-red-400">{{ error }}</p>

      <button
        type="submit"
        :disabled="busy"
        class="w-full rounded bg-white/10 py-2 text-sm font-semibold text-white
               hover:bg-white/15 disabled:opacity-40"
      >
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>
