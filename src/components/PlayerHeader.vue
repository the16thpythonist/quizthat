<template>
    <div id="player-header" :style="style()">
        <div class="row">
            <div id="player-name">{{ player.name }}</div>
            <div id="player-score">{{ player.score }} Punkte</div>
        </div>
        <div class="row">
            <div id="player-strength">{{ player.getStrength() }}</div>
            <div id="player-education">{{ player.getEducation() }}</div>
        </div>
    </div>
</template>

<script>
    import { defineComponent } from 'vue';
    import {Player} from '@/lib/player';

    export default defineComponent({
        name: "PlayerHeader",
        props: {
            player: {
                required: true,
                type: Player
            }
        },
        setup(props, context) {
            function style() {
                return {'background-color': props.player.color};
            }

            return {
                style
            }
        },
    });
</script>

<style scoped>
    #player-header {
        padding: 6px;
        border-bottom-style: solid;
        border-width: 1px;
        border-color: dimgray;
    }

    .row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
    }

    #player-strength, #player-education {
        font-variant: small-caps;
        font-size: 0.8em;
        color: dimgray;
    }
</style>