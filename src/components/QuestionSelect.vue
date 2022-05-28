<template>
    <div id="choice-selection">
        <div
                class="choice-item"
                v-for="(question, index) in questions"
                :key="question.name"
                :style="itemStyle(index)"
                @click="onSelect($event, index)">
            <img class="question-icon" :src="questionIcon(question)">
            <div class="text-container">
                <div class="row">
                    <div class="question-topic">{{ question.topic }}</div>
                    <div class="question-difficulty">Schwierigkeit {{ question.difficulty }}</div>
                </div>
                <div class="row" :style="{'flex-grow': 1}">
                    <div class="question-teaser">{{ question.teaser }}</div>
                </div>
                <div class="row">
                    <div class="question-type">{{ question.type }}</div>
                    <div class="question-points"><strong>{{ question.difficulty }}</strong> Punkte</div>
                </div>
            </div>

        </div>
    </div>
</template>

<script>
    /* eslint-disable */
    import {MultipleChoiceQuestion, Question} from "../lib/question";

    export default {
        name: "QuestionSelect",
        props: {
            questions: {
                required: true,
                type: Array
            }
        },
        data() {
            return {
                index: 0,
                question: new Question()
            }
        },
        methods: {
            onSelect(event, index) {
                this.index = index;
                this.question = this.questions[this.index];
                this.$emit('input', this.question);
            },
            itemStyle(index) {
                let style = {};
                if (index === this.index) {
                    style['border-color'] = 'lightblue';
                    style['outline'] = '1px';
                    style['border-width'] = '1px';
                } else {
                    style['border-color'] = 'lightgray'
                    style['border-width'] = '1px';
                }

                return style
            },
            questionIcon(question) {
                return `/assets/icon/${question.topic}.png`
            }
        }
    }
</script>

<style scoped>
    #choice-selection {
        display: flex;
        flex-direction: column;
    }

    .question-icon {
        width: 20%;
        padding: 2px;
    }

    .choice-item {
        padding: 5px;
        display: flex;
        flex-direction: row;
        border-style: solid;
        border-width: 1px;
        border-color: lightgray;
        border-radius: 5px;
        margin-bottom: 10px;
    }

    .text-container {
        width: 100%;
        margin-left: 10px;
    }

    .row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        margin-bottom: 2px;
    }

    .question-topic, .question-difficulty {
        font-variant: small-caps;
        font-size: 0.8em;
        color: gray;
    }

    .question-teaser {
        font-size: 1.1em;
    }

</style>