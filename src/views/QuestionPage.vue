<template>
    <ion-page>
        <ion-header :translucent="true">
            <ion-toolbar>
                <ion-buttons slot="start">
                    <ion-menu-button color="primary"></ion-menu-button>
                </ion-buttons>
                <ion-title>Runde {{ state.roundIndex }}</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content :fullscreen="true">
            <ion-header collapse="condense">
                <ion-toolbar>
                    <ion-title size="large">Runde {{ state.roundIndex }}</ion-title>
                </ion-toolbar>
            </ion-header>

            <div id="container">
                <player-header :player="player"></player-header>
                <component
                        :is="questionComponent"
                        :question="question"
                        ref="questionComponent"
                        @confirm="onQuestionConfirm($event)">
                </component>
            </div>
        </ion-content>
    </ion-page>
</template>

<script>
    /* eslint-disable */
    import { defineComponent } from 'vue';
    import { IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar, alertController } from '@ionic/vue';
    import { STATE } from "@/lib/game";
    import {loadQuestion, Question} from "@/lib/question";
    import FolderPage from "./FolderPage.vue";
    import MultipleChoiceComponent from "@/components/MultipleChoiceComponent.vue";
    import PlayerHeader from "@/components/PlayerHeader.vue";

    export default defineComponent({
        name: 'QuestionPage',
        components: {
            IonButtons,
            IonContent,
            IonHeader,
            IonMenuButton,
            IonPage,
            IonTitle,
            IonToolbar,
            PlayerHeader,
        },
        data() {
            return {
                state: STATE,
                player: STATE.currentPlayer,
                question: new Question(),
                questionComponent: FolderPage,
                questionComponents: {
                    'multiple-choice': MultipleChoiceComponent
                }
            }
        },
        methods: {
            createQuestionComponent() {
                this.questionComponent = this.questionComponents[this.question.type];
                this.$refs.questionComponent.question = this.question;
                // this.$forceUpdate();
                // console.log(this.question);
            },
            onQuestionConfirm(state) {
                this.presentAlert(state, 0);
            },
            continue() {
                console.log('continue');
            },
            async presentAlert(state, points) {
                const alert = await alertController.create({
                    cssClass: (state ? 'success-alert' : 'failure-alert'),
                    header: (state ? 'Richtig!' : 'Falsch!'),
                    message: `Du erhälst <strong>${points}</strong> Punkte!`,
                    buttons: [
                        {
                            'text': 'Weiter',
                            'cssClass': 'alert-continue-btn',
                            'handler': blah => {
                                this.continue();
                            }
                        }
                    ]
                });
                return alert.present();
            }
        },
        mounted() {
            let self = this;
            loadQuestion(this.$route.params.topic, this.$route.params.name).then((question) => {
                self.question = question;
                self.createQuestionComponent();
            });
        }
    });
</script>

<style scoped>

    #container {
        width: 100%;
        height: 100%;
        max-height: 100%;
        display: flex;
        flex-direction: column;
    }

    #continue-btn {
        width: 100%;
    }

</style>