<template>
    <div id="string-select">
        <div
                class="element"
                v-for="(option, key) in options"
                :key="key"
                :class="classElement(key)"
                @click="onSelect(key)">
            {{ option }}
        </div>
    </div>
</template>

<script>
    import { AUDIO } from "@/lib/audio";

    export default {
        name: "StringSelect",
        props: {
            options: {
                required: true,
                type: Object
            },
            value: {
                required: false,
                type: String,
                default: ''
            }
        },
        data() {
            return {
                key: this.value,
            }
        },
        methods: {
            onSelect(key) {
                this.key = key;
                this.$emit('input', this.key);
                AUDIO.playSelect();
            },
            classElement(key) {
                return {
                    element: true,
                    selected: this.key === key
                }
            }
        }
    }
</script>

<style scoped>

    #string-select {
        width: 100%;
        height: 100%;
        justify-content: space-between;
    }

    .element {
        width: 100%;
        border-style: solid;
        border-color: var(--ion-color-primary);
        border-width: 1px;
        border-radius: 3px;
        margin-bottom: 5%;
        text-align: center;
        background-color: white;
        font-family: var(--ion-font-family);
        padding: 10px;
        letter-spacing: 0.84px;
        font-weight: 400;
    }

    .selected {
        color: white;
        background-color: var(--ion-color-primary);
    }

</style>