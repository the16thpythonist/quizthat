<template>
    <ion-page>
        <ion-header :translucent="true">
            <ion-toolbar>
                <ion-buttons slot="start">
                    <ion-menu-button color="primary"></ion-menu-button>
                </ion-buttons>
                <ion-title v-if="STATE.isRunning">Runde {{ STATE.roundIndex }} / {{ STATE.roundLimit }}</ion-title>
                <ion-title v-if="!STATE.isRunning">Frage</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content :fullscreen="true">
            <ion-header collapse="condense">
                <ion-toolbar>
                    <ion-title size="large">None</ion-title>
                </ion-toolbar>
            </ion-header>

            <div id="container">
                <player-header :player="player" v-if="player !== null"></player-header>
                <component
                        :is="questionComponent"
                        :question="question"
                        :query="query"
                        :state="state"
                        :showDetails="showDetails"
                        @query="updateQuery($event)"
                        @confirm="onQuestionConfirm($event)"
                        @continue="onQuestionContinue($event)">
                </component>
            </div>
        </ion-content>
    </ion-page>
</template>

<script>
    /* eslint-disable */
    import { defineComponent, ref, onMounted } from 'vue';
    import { useRoute } from 'vue-router';
    import { IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar, alertController } from '@ionic/vue';
    import { useIonRouter } from '@ionic/vue';
    import { STATE } from "@/lib/game";
    import { AUDIO} from "@/lib/audio";
    import { loadQuestion, Question } from "@/lib/question";
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
        setup(props, context) {
            const questionComponents = {
                'multiple-choice': MultipleChoiceComponent
            }

            const route = useRoute()
            const ionRouter = useIonRouter();

            // The question to be displayed is encoded as the url path. From that question object we can then also
            // extract what type it is which we can then use to dynamically display the appropriate question component.
            const question = ref(null);
            const questionComponent = ref(null);
            loadQuestion(route.params.topic, route.params.name).then((_question) => {
                _question.prepareAudio();
                question.value = _question;
                questionComponent.value = questionComponents[_question.type];

                setTimeout(() => {
                    if (question.value !== null) {
                        question.value.playAudio();
                    }
                }, 500);
            })


            // The player for the question we get as a URL query parameter. Specifically this can also be none, in
            // which case there is no player and instead the view is simply used to look at the question outside of
            // the game loop
            const player = ref(null);
            if (Object.hasOwn(route.query, 'playerId')) {
                player.value = STATE.players[route.query.playerId];
            }

            // Another thing which is encoded in the url query params is the instructions of how to proceed with the
            // question. "isOpen" is a flag which indicates that the question should move on to be posed to the next
            // player if the current one was wrong. "next" is the player id of the next player to be given that
            // question.
            const isOpen = ref(false);
            if (Object.hasOwn(route.query, 'isOpen')) {
                isOpen.value = (route.query.isOpen === 'true');
            }

            // Aside from the player, the URL query parameters also encode the current state of the input which we need
            // to pass to the corresponding question widget
            const query = ref(route.query);

            // This is the state of the answer. If this is null it indicates that no answer has yet been
            // given. If it is true then the answer was correct and if it is false the answer was wrong
            const state = ref(null);
            // This is a flag which indicates to the question component whether or not it should show the
            // details aka the solution to the question on the screen.
            const showDetails = ref(false);

            function moveOn() {
                question.value.close();
                delete question.value;

                const path = STATE.nextPath();
                ionRouter.push(path)
            }

            function onQuestionContinue(points) {
                // "outcome" true means that the player gave the correct answer. In that case we add the points to the
                // score and move on to the next player and the next question.
                if (state.value === true) {
                    player.value.score += points;
                    moveOn();
                }
                // if the player was not correct then depending on the state of the "isOpen" flag, the next player in
                // line gets the chance!
                else {
                    if (isOpen.value === true) {
                        // We set the next player so that he has a chance
                        player.value = STATE.nextPlayer(player.value);
                        // But then we also need to update the isOpen flag and the next player for potentially the
                        // the next chance.
                        isOpen.value = false;
                        state.value = null;
                        showDetails.value = false;
                        updateQuery();
                    } else {
                        moveOn();
                    }
                }
            }

            function onQuestionConfirm(_state) {
                state.value = _state;
                // We show the result if the question is either correct or if the question is no longer open
                // for further answers.
                if (state.value === true || isOpen.value === false) {
                    showDetails.value = true;
                }
                // Depending on whether the question is correct or not we also play a corresponding sound
                // effect
                if (state.value === true) {
                    AUDIO.playCorrect();
                } else {
                    AUDIO.playWrong()
                }
            }

            function updateQuery(_query = {}) {
                const searchParams = new URLSearchParams({...query._rawValue, ..._query});
                STATE.currentPath = `${route.path}?${searchParams.toString()}`;
            }

            return {
                STATE,
                question,
                player,
                query,
                state,
                showDetails,
                questionComponent,
                onQuestionConfirm,
                onQuestionContinue,
                updateQuery
            }
        },
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