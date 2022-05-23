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
                <div id="player-list">
                    <div
                            class="player-element"
                            v-for="(player, playerId) in STATE.players"
                            :key="playerId"
                            :style="containerStyle(player)">
                        <div class="row">
                            <div class="player-name"> {{ player.name }} </div>
                            <div class="player-score"> {{ player.score }} Punkte </div>
                        </div>
                        <div class="row">
                            <div class="player-strength"> {{ STRENGTHS[player.strength] }} </div>
                            <div class="player-education"> {{ EDUCATIONS[player.education] }} </div>
                        </div>
                    </div>
                </div>
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

    export default defineComponent({
        name: 'OverviewPage',
        components: {
            IonButtons,
            IonContent,
            IonHeader,
            IonMenuButton,
            IonPage,
            IonTitle,
            IonToolbar
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

    #player-list {
        width: 100%;
        height: 100%;
        padding: 10px;
        display: flex;
        flex-direction: column;
    }

    .player-element {
        padding: 10px;
        border-radius: 4px;
        margin-bottom: 10px;
        display: flex;
        flex-direction: column;
    }

    .row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    }

    .player-strength, .player-education {
        font-variant: small-caps;
        font-size: 0.8em;
        color: gray;
    }
</style>