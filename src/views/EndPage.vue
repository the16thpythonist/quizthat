<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button color="primary"></ion-menu-button>
        </ion-buttons>
        <ion-title>{{ $route.params.id }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ $route.params.id }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <div id="container">

          <player-overview
                  class="player-overview"
                  :players="players">
          </player-overview>

          <ion-button class="finish-button" @click="onPressFinish">
              Fertig
          </ion-button>

      </div>
    </ion-content>
  </ion-page>
</template>

<script>
import { defineComponent } from 'vue';
import { IonButtons, IonButton, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { useIonRouter } from '@ionic/vue';
import PlayerOverview from '@/components/PlayerOverview.vue';

import { STATE } from "../lib/game";

export default defineComponent({
  name: 'EndPage',
  components: {
      PlayerOverview,
      IonButton,
      IonButtons,
      IonContent,
      IonHeader,
      IonMenuButton,
      IonPage,
      IonTitle,
      IonToolbar,
    },
    setup(props, context) {
        const ionRouter = useIonRouter();
        const players = Object.values(STATE.players);

        STATE.currentPath = '/end';

        function onPressFinish() {
            STATE.endGame();
            ionRouter.push('/home');
        }

        return {
            players,
            onPressFinish
        }
    }
});
</script>

<style scoped>
    #container {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .player-overview {
        flex-grow: 1;
        width: 100%;
    }

    .finish-button {
        width: 80%;
        margin: 20px;
    }
</style>