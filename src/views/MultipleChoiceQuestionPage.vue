<template>
    <ion-page>
        <ion-header :translucent="true">
            <ion-toolbar>
                <ion-buttons slot="start">
                    <ion-menu-button color="primary"></ion-menu-button>
                </ion-buttons>
                <ion-title>Question</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content :fullscreen="true">
            <ion-header collapse="condense">
                <ion-toolbar>
                    <ion-title size="large">{{ $route.params.id }}</ion-title>
                </ion-toolbar>
            </ion-header>

            <div id="container">
                <div id="header-container">
                    <div id="header-topic">{{ question.topic }}</div>
                    <div id="header-teaser">{{ question.teaser }}</div>
                </div>
                <div id="question-container">
                    <div id="question">{{ question.content }}</div>
                </div>
                <div id="options-container">
                    <div class="option" v-for="(value, key) in question.options" :key="key">
                        <ion-button class="option-btn">{{ value }}</ion-button>
                    </div>
                </div>
                <div class="bottom-spacer">

                </div>
            </div>
        </ion-content>
    </ion-page>
</template>

<script lang="ts">
    /* eslint-disable */
    import { defineComponent } from 'vue';
    import { IonButton, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
    import { useRoute } from 'vue-router';
    import { MultipleChoiceQuestion, loadQuestion } from "@/lib/question";

    export default defineComponent({
        name: 'FolderPage',
        components: {
            IonButton,
            IonContent,
            IonHeader,
            IonMenuButton,
            IonPage,
            IonTitle,
            IonToolbar
        },
        created() {
            console.log("Entered Question");
            const route = useRoute();
            let self = this;
            loadQuestion(route.params.topic, route.params.name).then((question) => {
                self.question = question;
            });
            setTimeout(() => {
                console.log(self.question);
            }, 1000)
        },
        data() {
            return {
                question: new MultipleChoiceQuestion()
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
        align-items: center;
        align-content: stretch;
    }

    #header-container {
        display: flex;
        flex-direction: column;
        margin-top: 2%;
        margin-bottom: 2%;
        align-items: center;
    }

    #header-topic {
        font-variant: small-caps;
        font-size: 0.8em;
        color: gray;
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
        display: flex;
        flex-direction: column;
        align-content: stretch;
        justify-content: space-between;
        height: 100%;
        width: 90%;
    }

    .option {
        display: flex;
        flex-direction: column;
        align-items: stretch;
    }

    .bottom-spacer {
        height: 40%;
    }

</style>