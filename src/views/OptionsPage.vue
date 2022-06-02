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
                <div id="game-settings">

                    <ion-item
                            v-for="[key, data] in config"
                            :key="key">
                        <ion-label class="label">{{ data['label'] }}</ion-label>
                        <ion-input
                                class="ion-text-right"
                                :key="key"
                                :type="data['inputType']"
                                :value="OPTIONS.get(key)"
                                @input="OPTIONS.set(key, $event.target.value)">
                        </ion-input>
                    </ion-item>

                </div>

                <div id="game-settings-boolean">
                    <ion-item
                            v-for="[key, data] in configBoolean"
                            :key="key">
                        <ion-label class="label">{{ data['label'] }}</ion-label>
                        <ion-checkbox
                                :key="key"
                                :modelValue="OPTIONS.get(key)"
                                @update:modelValue="OPTIONS.set(key, $event);">
                        </ion-checkbox>
                    </ion-item>
                </div>
            </div>
        </ion-content>
    </ion-page>
</template>

<script>
    import { defineComponent, ref, onMounted, computed } from 'vue';
    import { IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar, IonInput, IonItem, IonLabel, IonCheckbox } from '@ionic/vue';
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
            IonLabel,
            IonCheckbox
        },
        setup(props, context) {

            const config = computed(() => {
                return Object.entries(OPTIONS.config).filter(([key, data]) => {
                    return ['number'].includes(data['inputType']);
                })
            })

            const configBoolean = computed(() => {
                return Object.entries(OPTIONS.config).filter(([key, data]) => {
                    return ['boolean'].includes(data['inputType']);
                })
            })

            return {
                config,
                configBoolean,
                OPTIONS,
                console
            }
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