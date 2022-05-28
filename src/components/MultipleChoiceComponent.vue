<template>

    <div id="container">
        <div id="question-container">
            <div id="question-teaser">{{ question.teaser }}</div>
            <div id="question">{{ question.content }}</div>
        </div>

        <div id="options-container">
            <string-select
                    :options="question.options"
                    :value="selectedOption"
                    @input="onSelect($event)">
            </string-select>
        </div>

        <ion-button id="confirm" @click="onPressConfirm()">
            Bestätigen
        </ion-button>
    </div>

</template>

<script>
    /* eslint-disable */
    import { defineComponent, ref } from 'vue';
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

            return {
                selectedOption,
                onSelect,
                onPressConfirm
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

    #options-container {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-content: stretch;
        flex-grow: 1;
        padding: 10px;
    }

    #confirm {
        margin: 10px;
        width: 90%;
        height: 5%;
    }

</style>