<template>
    <button :id="hash" class="picker" :style="buttonStyle()"></button>
    <ion-modal :trigger="hash">
        <color-picker-screen
                :value="this.color"
                :options="this.options"
                @input="onColorInput">
        </color-picker-screen>
    </ion-modal>

</template>

<script>
    /* eslint-disable */

    import { IonPicker, IonButton, IonModal, modalController } from '@ionic/vue';
    import ColorPickerScreen from "@/components/ColorPickerScreen";
    import { ref } from "vue";

    export default {
        name: "ColorPicker",
        components: {
            ColorPickerScreen,
            IonPicker,
            IonButton,
            IonModal,
        },
        props: {
            value: {
                type: String,
                required: true,
            },
            options: {
                type: Array,
                required: false,
                default(args) {
                    return ['#000000']
                }
            }
        },
        data() {
            // So this is a funny story, why i need this hash here. As you can see in the html above I use this
            // hash as the ID of the actual picker button, that is because if I did it with a static ID then opening
            // the modal would not work. With multiple such color picker buttons on screen clicking one of them would
            // open the modal for all of them. My workaround for this was to simply give each button a unique ID...
            let r = Math.random().toString(36).substring(7);
            return {
                color: this.value,
                hash: r
            }
        },
        methods: {
            onColorInput(color) {
                this.color = color;
                this.$forceUpdate();
                this.$emit('input', color);
            },
            buttonStyle() {
                return {
                    'background-color': this.color
                }
            },
        }
    }
</script>

<style scoped>

    .picker {
        min-width: 30px;
        min-height: 30px;
        border-radius: 5px;
    }
</style>