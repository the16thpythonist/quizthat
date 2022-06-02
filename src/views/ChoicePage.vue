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
                <player-header class="header-container" :player="player"></player-header>

                <question-select
                        class="question-selection"
                        :questions="questions"
                        @input="onSelectQuestion($event)">
                </question-select>

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
    import { defineComponent, ref, reactive , onMounted } from 'vue';
    import { useRoute } from 'vue-router';
    import { IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar, IonButton } from '@ionic/vue';
    import { useIonRouter } from '@ionic/vue';
    import {STATE} from "../lib/game";
    import {Player} from "../lib/player";
    import {Question, loadQuestion} from "../lib/question";
    import QuestionSelect from '../components/QuestionSelect.vue';
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
            QuestionSelect
        },
        setup(props, context) {
            const route = useRoute();

            // First of all - We can extract the player ID from the route parameters. The corresponding player object
            // is saved in the global game state and we can retrieve it like this:
            const player = ref(STATE.players[route.params.playerId]);

            // The second thing which is encoded in the route is the actual choice of questions which should be
            // displayed:
            const questions = ref([]);
            for (let questionPath of route.query.questions) {
                const [topic, name] = questionPath.split('|');
                loadQuestion(topic, name).then((question) => {
                    questions.value.push(question);
                });
            }

            const ionRouter = useIonRouter();
            const question = ref(new Question());
            const valid = ref(false);

            function playerStyle() {
                return {'background-color': player.color}
            }

            function onSelectQuestion(_question) {
                question.value = _question;
                valid.value = true;
            }

            function onPressContinue() {
                if (valid) {
                    ionRouter.push(STATE.questionPath(player.value, question.value));
                } else {
                    console.log('You have not selected any question, you cannot continue!');
                }
            }

            return {
                ionRouter,
                player,
                question,
                questions,
                valid,
                playerStyle,
                onSelectQuestion,
                onPressContinue
            }
        }
    });
</script>

<style scoped>

    .header-container {
        width: 100%;
    }

    #container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        align-items: center;
    }

    .question-selection {
        padding: 10px;
        height: 100%;
        margin-top: 20px;
    }

    #continue-btn {
        width: 80%;
        margin: 20px;
    }

</style>
