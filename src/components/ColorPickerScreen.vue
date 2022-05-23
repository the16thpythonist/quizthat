<template>
    <div id="picker-screen">
        <div id="title-container">
            <h2>Farbe Auswählen</h2>
            <button id="close" @click="dismiss()">
                x
            </button>
        </div>
        <div id="option-container">
            <div class="color-option" v-for="colorOption in options" :key="colorOption">
                <button class="color-btn" :style="buttonStyle(colorOption)" @click="onPress(colorOption)"></button>
            </div>
        </div>
    </div>
</template>

<script>
    /* eslint-disable */

    import { IonContent, modalController } from '@ionic/vue';

    export default {
        name: "ColorPickerScreen",
        components: {
            IonContent
        },
        props: {
            value: {
                type: String,
                default: '#FF0000'
            },
            options: {
                type: Array,
                default(rawArgs) {
                    return ['#FF0000', '#00FF00', '#0000FF']
                }
            },
        },
        data() {
            return {
                color: this.value,
            }
        },
        methods: {
            onPress(color) {
                this.$emit('input', color);
                this.dismiss();
            },
            dismiss() {
                modalController.dismiss();
            },
            buttonStyle(color) {
                let style =  {
                    'background-color': color,
                };

                if (color === this.color) {
                    style['border-color'] = '#000000';
                }

                return style
            }
        }
    }
</script>

<style scoped>

    #picker-screen {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        align-content: space-between;
    }

    #title-container {
        display: flex;
        flex-direction: row;
        padding: 10px;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        background-color: #ebebeb;
        margin-bottom: 10px;
    }

    #close {
        font-size: 1.5em;
        width: 15%;
        height: 100%;
        background-color: rgba(255,255,255,0);
    }

    #option-container {
        flex-direction: row;
        justify-content: space-evenly;
        align-items: center;
        height: 100%;
        width: 100%;
        padding: 10px;
    }

    .color-option {
        width: 33%;
    }

    .color-btn {
        min-width: 60px;
        min-height: 60px;
        border-radius: 5px;
        border-style: solid;
        border-color: rgba(255,255,255,0);
        border-width: 3px;
        margin: 10px;
    }
</style>