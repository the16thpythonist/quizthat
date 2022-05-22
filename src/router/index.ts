import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';

// Is this a quirk of typescript in contrast to javascript. The routes variable here has a type annotation and I am not
// sure if this is a JS feature as well?
const routes: Array<RouteRecordRaw> = [
  {
    path: '',
    redirect: '/home'
  },
  {
    path: '/folder/:id',
    component: () => import ('../views/FolderPage.vue')
  },
  {
    path: '/home',
    // This is an interesting feature. So usually in Vue one would supply the actual class here as the "component" and
    // then when this route is invoked that corresponding class would be rendered as the main component of that route.
    // Here we pass a callable with an import. What this does is that it postpones the loading of that component until
    // the very moment that component is actually needed!
    component: () => import ('../views/HomePage.vue')
  },
  {
    path: '/start',
    component: () => import ('../views/StartGamePage.vue')
  },
  {
    path: '/question/:topic/:name',
    component: () => import ('../views/MultipleChoiceQuestionPage.vue')
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
