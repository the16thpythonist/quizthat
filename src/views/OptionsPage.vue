<template>
    <ion-page>
        <ion-header :translucent="true">
            <ion-toolbar>
                <ion-buttons slot="start">
                    <ion-menu-button color="primary"></ion-menu-button>
                </ion-buttons>
                <ion-title>Optionen</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content :fullscreen="true">
            <ion-header collapse="condense">
                <ion-toolbar>
                    <ion-title size="large">{{ $route.params.id }}</ion-title>
                </ion-toolbar>
            </ion-header>

            <div id="container">
                <h1>Spieleinstellungen</h1>
                <div id="game-options">

                    <ion-item>
                        <ion-label class="label">Rundenanzahl</ion-label>
                        <ion-input
                                type="number"
                                ref="rounds"
                                @input="OPTIONS.set('rounds', $event.target.value)">
                        </ion-input>
                    </ion-item>

                </div>
            </div>
        </ion-content>
    </ion-page>
</template>

<script>
    import { defineComponent } from 'vue';
    import { IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar, IonInput, IonItem, IonLabel } from '@ionic/vue';
    import { OPTIONS } from "../lib/options";

    export default defineComponent({
        name: 'OptionsPage',
        components: {
            IonButtons,
            IonContent,
            IonHeader,
            IonMenuButton,
            IonPage,
            IonTitle,
            IonToolbar,
            IonInput,
            IonItem,
            IonLabel
        },
        data() {
            return {
                OPTIONS: OPTIONS,
                console: console
            }
        },
        mounted() {
            setTimeout(() => {
                for (let key in this.$refs) {
                    OPTIONS.get(key).then((value) => {
                        this.$refs[key].$el.value = value;
                    });
                }
            }, 100)
        }
    });
</script>

<style scoped>

    #container {
        width: 100%;
        height: 100%;
        padding: 10px;
    }

    h1 {
        border-width: 2px;
        padding-bottom: 5px;
        margin-bottom: 5px;
    }

    .label {
        margin-right: 20px;
        color: gray;
    }

</style>