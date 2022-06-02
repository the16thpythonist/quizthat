<template>

    <div id="container" :style="getStyleContainer()">

        <div id="question-container">
            <div id="question-teaser">{{ question.teaser }}</div>
            <div id="question">{{ question.content }}</div>
        </div>

        <div
                v-if="showDetails"
                id="details-container">
            <div id="details">
                {{ question.details }}
            </div>
        </div>

        <div id="options-container">
            <string-select
                    :options="question.options"
                    :value="selectedOption"
                    @input="onSelect($event)">
            </string-select>
        </div>

        <ion-button
                v-if="state === null"
                id="confirm"
                class="button"
                @click="onPressConfirm()">
            Bestätigen
        </ion-button>
        <ion-button
                v-else
                id="continue"
                class="button"
                @click="onPressContinue()">
            Weiter
        </ion-button>
    </div>

</template>

<script>
    /* eslint-disable */
    import { defineComponent, ref, onMounted } from 'vue';
    import { IonButton } from '@ionic/vue';
    import { useRoute } from 'vue-router';
    import { MultipleChoiceQuestion, Question, loadQuestion } from "@/lib/question";
    import StringSelect from "./StringSelect";

    export default defineComponent({
        name: 'FolderPage',
        components: {
            StringSelect,
            IonButton,
        },
        props: {
            question: {
                required: true,
                type: Question,
            },
            query: {
                required: false,
                type: Object,
                default: () => {return {}; }
            },
            state: {
                required: false,
                type: Boolean,
                default: null
            },
            showDetails: {
                required: false,
                type: Boolean,
                default: false,
            }
        },
        setup(props, context) {

            const selectedOption = ref('');
            if (Object.keys(props.query).includes('selected')) {
                selectedOption.value = props.query.selected;
            }

            function onSelect(option) {
                selectedOption.value = option;
                context.emit('query', {selected: selectedOption.value});
            }

            function onPressConfirm() {
                context.emit('confirm', selectedOption.value === props.question.solution);
            }

            function onPressContinue() {
                context.emit('continue', props.question.getPoints());
            }

            function getStyleContainer() {
                let style = {};

                if (props.state !== null) {
                    style['background-color'] = props.state ? '#DCFFE6' : '#FFDBDB';
                }

                return style;
            }

            return {
                selectedOption,
                onSelect,
                onPressConfirm,
                onPressContinue,
                getStyleContainer
            }
        }
    });

</script>

<style scoped>

    #container {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        align-content: stretch;
    }

    #question-teaser {
        color: gray;
        font-size: 0.9em;
    }

    #question-container {
        margin-left: 2%;
        margin-right: 2%;
        margin-top: 10%;
        margin-bottom: 10%;
        font-size: 1.2em;
        text-align: center;
    }

    #details-container {
        padding: 10px;
        width: 100%;

    }

    #details {
        padding: 10px;
        font-size: 0.9em;
        color: gray;
        border-style: solid;
        border-width: 1px;
        border-radius: 5px;
        border-color: lightgray;
        background-color: rgba(1,1,1,0.05);
        width: 100%;
    }

    #options-container {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-content: stretch;
        flex-grow: 1;
        padding: 10px;
    }

    .button {
        width: 80%;
        margin: 20px;
    }

</style>