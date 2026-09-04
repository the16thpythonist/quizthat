import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/**
 * Two pages, and that is the whole of the routing.
 *
 * CLAUDE.md's rule is that *the game* has no router: navigation inside a game
 * means changing `GameState`, and `App.vue` renders `screenForState(state)`.
 * That still holds — nothing below routes a screen. The router exists only to
 * keep the curator's editor off the game's page, because the editor is a
 * genuinely separate application that happens to share a build: it has no
 * session, no seat and no board, and putting it behind a `GameState` would have
 * meant inventing states the engine's transition table would then have to
 * allow.
 *
 * So: `/` is the game, exactly as before, and `/admin` is the editor. Do not
 * add a third route for something that is really a game screen.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'game',
    component: () => import('./App.vue'),
  },
  {
    path: '/admin',
    name: 'admin',
    // Lazily loaded, so a tablet that only ever plays never downloads the
    // editor — it is the larger of the two and useless without a password.
    component: () => import('./admin/AdminView.vue'),
  },
  // The game owns the hash for its test benches (#animations, #audio), so an
  // unknown path is far more likely a typo than a deep link. Send it home.
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
