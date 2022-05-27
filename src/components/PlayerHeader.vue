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
    import {Player} from '@/lib/player';

    export default {
        name: "PlayerHeader",
        props: {
            player: {
                required: true,
                type: Player
            }
        },
        methods: {
            style() {
                return {
                    'background-color': this.player.color
                }
            }
        }
    }
</script>

<style scoped>
    #player-header {
        padding: 6px;
    }

    .row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
    }

    #player-strength, #player-education {
        font-variant: small-caps;
        font-size: 0.8em;
        color: gray;
    }
</style>