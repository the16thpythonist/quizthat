<template>
    <ion-page>
        <ion-header :translucent="true">
            <ion-toolbar>
                <ion-buttons slot="start">
                    <ion-menu-button color="primary"></ion-menu-button>
                </ion-buttons>
                <ion-title>QuizThat</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content :fullscreen="true">
            <ion-header collapse="condense">
                <ion-toolbar>
                    <ion-title size="large">{{ $route.params.id }}</ion-title>
                </ion-toolbar>
            </ion-header>

            <div id="container">
                <div id="title">QuizThat!</div>
                <div class="menu-container">
                    <ion-button class="menu-button" id="new-game" router-link="/start">Neues Spiel</ion-button>
                    <ion-button class="menu-button" id="question" router-link="/question/mathematics/mc_summe_benennen">Question</ion-button>
                    <ion-button class="menu-button" id="options">Optionen</ion-button>
                    <ion-button class="menu-button" id="credits">Credits</ion-button>
                </div>
                <div class="bottom-spacer"></div>
            </div>
        </ion-content>
    </ion-page>
</template>

<script lang="ts">
    import { defineComponent } from 'vue';
    import { IonButton, IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar } from '@ionic/vue';

    export default defineComponent({
        name: 'FolderPage',
        components: {
            IonButton,
            IonButtons,
            IonContent,
            IonHeader,
            IonMenuButton,
            IonPage,
            IonTitle,
            IonToolbar
        }
    });
</script>

<style scoped>
    #title {
        font-size: 2em;
        margin-top: 20%;
        margin-bottom: 20%;
    }

    div.menu-container {
        width: 50%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: stretch;
        flex-grow: 1;
    }

    .menu-button {
        margin-bottom: 10%
    }

    #container {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        align-content: stretch;
    }

    .bottom-spacer {
        height: 30%;
    }

</style>