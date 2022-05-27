<template>
    <ion-page>
        <ion-header :translucent="true">
            <ion-toolbar>
                <ion-buttons slot="start">
                    <ion-menu-button color="primary"></ion-menu-button>
                </ion-buttons>
                <ion-title>Spieler Festlegen</ion-title>
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
                    <div class="player-element" v-for="(player, playerId) in players" :key="playerId">
                        <div class="row">
                            <ion-input
                                    class="player-name"
                                    placeholder="Spielername"
                                    :value="player.name"
                                    @ionChange="onNameInput($event, player)"
                                    ></ion-input>
                            <color-picker
                                    class="color-picker"
                                    :value="player.color"
                                    :options="colorOptions"
                                    @input="onColorInput($event, player)"></color-picker>

                        </div>
                        <div class="row">
                            <ion-select
                                    class="select"
                                    placeholder="Stärke"
                                    interface="action-sheet"
                                    @ionChange="onStrengthSelect($event, player)">
                                <ion-select-option
                                        v-for="(label, value) in STRENGTHS"
                                        :key="value"
                                        :value="value">
                                    {{ label }}
                                </ion-select-option>
                            </ion-select>
                            <ion-select
                                    class="select"
                                    placeholder="Bildung"
                                    interface="action-sheet"
                                    @ionChange="onEducationSelect($event, player)">
                                <ion-select-option
                                        v-for="(label, value) in EDUCATIONS"
                                        :key="value"
                                        :value="value">
                                    {{ label }}
                                </ion-select-option>
                            </ion-select>
                            <button class="remove-button" @click="onPlayerRemove(playerId)">
                                <ion-icon class="remove-icon" :icon="close" color="danger"></ion-icon>
                            </button>
                        </div>
                    </div>
                </div>
                <ion-button id="start" @click="onStartGame()">Spiel Starten</ion-button>

                <ion-fab vertical="bottom" horizontal="end" slot="fixed">
                    <ion-fab-button @tap="addPlayer" @click="addPlayer">
                        <ion-icon :icon="add"></ion-icon>
                    </ion-fab-button>
                </ion-fab>
            </div>
        </ion-content>
    </ion-page>
</template>

<script>
    /* eslint-disable */

    import { defineComponent } from 'vue';
    import { IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar, IonInput, IonFab, IonFabButton, IonIcon, IonSelect, IonSelectOption} from '@ionic/vue';
    import { addCircle, add, close } from 'ionicons/icons';
    import { useIonRouter } from '@ionic/vue';
    import { Player, STRENGTHS, EDUCATIONS } from '@/lib/player';
    import { STATE } from '@/lib/game';
    import ColorPicker from "@/components/ColorPicker.vue";

    export default defineComponent({
        name: 'FolderPage',
        components: {
            ColorPicker,
            IonFab,
            IonFabButton,
            IonIcon,
            IonInput,
            IonButtons,
            IonContent,
            IonHeader,
            IonMenuButton,
            IonPage,
            IonTitle,
            IonToolbar,
            IonSelect,
            IonSelectOption
        },
        setup() {
            const ionRouter = useIonRouter();

            return {
                add,
                close,
                STRENGTHS,
                EDUCATIONS,
                STATE,
                ionRouter
            }
        },
        data() {
            let firstPlayer = new Player();
            let players = {}
            return {
                players: players,
                colorOptions: [
                    '#FFA4A4',
                    '#FFC8A3',
                    '#FFF6A3',
                    '#C8FFA3',
                    '#A3FFF6',
                    '#A3CEFF',
                    '#F0A3FF',
                    '#FFA3D0',
                ]
            }
        },
        methods: {
            addPlayer() {
                const player = new Player();
                // https://stackoverflow.com/questions/4550505/getting-a-random-value-from-a-javascript-array
                player.color = this.colorOptions[Math.floor(Math.random() * this.colorOptions.length)];
                this.players[player.id] = player;
                this.$forceUpdate();
            },
            onPlayerRemove(playerId) {
                delete this.players[playerId];
            },
            onNameInput(event, player) {
                //console.log(event);
                player.name = event.target.value;
            },
            onStrengthSelect(event, player) {
                player.strength = event.detail.value;
            },
            onEducationSelect(event, player) {
                player.education = event.detail.value;
            },
            onColorInput(color, player) {
                //console.log(color);
                player.color = color;
            },
            onStartGame() {
                STATE.players = this.players;
                STATE.startGame();
                this.ionRouter.push(`/choice/${STATE.currentPlayer.id}`);
            }
        }
    });
</script>

<style scoped>
    #container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        align-items: center;
    }

    .player-element {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        border-style: solid;
        border-width: 1px;
        border-color: #ebebeb;
        border-radius: 4px;
        width: 90%;
        padding: 10px;
        margin-top: 2%;
    }

    .row {
        width: 100%;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
    }

    #player-list {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-grow: 1;
        margin-top: 5%;
        width: 100%;
    }

    .select {
        width: 45%;
        --padding-start: 8px;
    }

    .remove-button {
        background-color: rgba(0, 0, 0, 0);
        border-radius: 50%;
    }

    .remove-icon {
        font-size: 1.5em;
    }

    #start {
        margin-top: 5%;
        margin-bottom: 5%;
    }

</style>