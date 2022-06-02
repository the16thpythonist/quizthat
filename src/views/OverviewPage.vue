<template>
    <ion-page>
        <ion-header :translucent="true">
            <ion-toolbar>
                <ion-buttons slot="start">
                    <ion-menu-button color="primary"></ion-menu-button>
                </ion-buttons>
                <ion-title>Spieler Übersicht</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content :fullscreen="true">
            <ion-header collapse="condense">
                <ion-toolbar>
                    <ion-title size="large">{{ $route.params.id }}</ion-title>
                </ion-toolbar>
            </ion-header>

            <div id="container">
                <player-overview :players="Object.values(STATE.players)">
                </player-overview>
            </div>
        </ion-content>
    </ion-page>
</template>

<script>
    /* eslint-disable */
    import { defineComponent } from 'vue';
    import { IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
    import { STATE } from '@/lib/game';
    import { EDUCATIONS, STRENGTHS } from "@/lib/player";
    import PlayerOverview from '@/components/PlayerOverview.vue';

    export default defineComponent({
        name: 'OverviewPage',
        components: {
            IonButtons,
            IonContent,
            IonHeader,
            IonMenuButton,
            IonPage,
            IonTitle,
            IonToolbar,
            PlayerOverview
        },
        setup() {
            return { STATE, EDUCATIONS, STRENGTHS }
        },
        methods: {
            containerStyle(player) {
                return {
                    'background-color': player.color,
                }
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
    }

</style>