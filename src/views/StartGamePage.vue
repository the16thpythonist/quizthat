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
                    <div class="player-element" v-for="player in players" :key="player.name">
                        <div class="row">
                            <ion-input class="player-name" placeholder="Spielername" :value="player.name"></ion-input>
                            <color-picker :value="player.color" @input="onColorInput($event, player)"></color-picker>

                        </div>
                        <div class="row">
                            <ion-select placeholder="Stärke" interface="action-sheet">
                                <ion-select-option value="science">Wissenschaft</ion-select-option>
                                <ion-select-option value="sports">Sport</ion-select-option>
                            </ion-select>
                            <ion-select placeholder="Bildung" interface="action-sheet">
                                <ion-select-option value="0">Grundschule</ion-select-option>
                            </ion-select>
                        </div>
                    </div>
                </div>
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
    import { addCircle, add } from 'ionicons/icons';
    import { Player } from '@/lib/player';
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
            return {
                add
            }
        },
        data() {
            return {
                players: [new Player()]
            }
        },
        methods: {
            addPlayer() {
                const player = new Player();
                this.players.push(player);
                this.$forceUpdate();
            },
            onColorInput(color, player) {
                player.color = color
                console.log(this.players);
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
    }

    #player-list {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-grow: 1;
        margin-top: 5%;
        width: 100%;
    }

</style>