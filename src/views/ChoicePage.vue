<template>
    <ion-page>
        <ion-header :translucent="true">
            <ion-toolbar>
                <ion-buttons slot="start">
                    <ion-menu-button color="primary"></ion-menu-button>
                </ion-buttons>
                <ion-title>Frage wählen</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content :fullscreen="true">
            <ion-header collapse="condense">
                <ion-toolbar>
                    <ion-title size="large">{{ $route.params.id }}</ion-title>
                </ion-toolbar>
            </ion-header>

            <div id="container">
                <player-header :player="player"></player-header>

                <question-selection
                        class="question-selection"
                        :questions="questions"
                        @input="onSelectQuestion($event)">
                </question-selection>

                <ion-button
                        id="continue-btn"
                        @click="onPressContinue()">
                    Weiter
                </ion-button>

            </div>
        </ion-content>
    </ion-page>
</template>

<script>
    /* eslint-disable */
    import { defineComponent } from 'vue';
    import { IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar, IonButton } from '@ionic/vue';
    import { useIonRouter } from '@ionic/vue';
    import {STATE} from "../lib/game";
    import {Player} from "../lib/player";
    import {Question, loadQuestion} from "../lib/question";
    import QuestionSelection from '../components/QuestionSelection.vue';
    import PlayerHeader from "../components/PlayerHeader";

    export default defineComponent({
        name: 'FolderPage',
        components: {
            PlayerHeader,
            IonButtons,
            IonButton,
            IonContent,
            IonHeader,
            IonMenuButton,
            IonPage,
            IonTitle,
            IonToolbar,
            QuestionSelection
        },
        data() {
            return {
                ionRouter: useIonRouter(),
                player: new Player(),
                question: new Question(),
                questions: [],
                valid: false
            }
        },
        methods: {
            playerStyle() {
                return {
                    'background-color': this.player.color
                }
            },
            onSelectQuestion(question) {
                this.valid = true;
                this.question = question;
            },
            onPressContinue() {
                if (this.valid) {
                    console.log(this.question);
                    this.ionRouter.push(`/question/${this.question.topic}/${this.question.name}`);
                } else {
                    console.log('You have not selected any question, you cannot continue!');
                }
            }
        },
        mounted() {
            this.player = STATE.players[this.$route.params.playerId];
            let self = this;
            loadQuestion('mathematics', 'mc_summe_benennen').then((question) => {
                self.questions.push(question);
            })
            loadQuestion('mathematics', 'mc_produkt_benennen').then((question) => {
                self.questions.push(question);
                self.questions.push(question);
            })
        }
    });
</script>

<style scoped>
    #container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
    }

    #player-container {
        display: flex;
        flex-direction: column;
        padding: 10px;
    }

    .row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
    }

    .question-selection {
        padding: 10px;
        height: 100%;
        margin-top: 20px;
    }

    #continue-btn {
        margin: 10px;
        margin-top: 5%;
        margin-bottom: 5%;
    }

</style>
