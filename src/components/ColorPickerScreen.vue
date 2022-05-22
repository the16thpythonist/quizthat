<template>
    <div id="picker-screen">
        <div class="color-option" v-for="colorOption in options" :key="colorOption">
            <button class="color-btn" :style="buttonStyle(colorOption)" @click="onPress(colorOption)"></button>
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
        padding: 10px;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        align-content: space-between;
    }

    .color-btn {
        min-width: 50px;
        min-height: 50px;
        border-radius: 5px;
        border-style: solid;
        border-color: rgba(255,255,255,0);
        border-width: 3px;
        margin: 20px;
    }
</style>