<template>
    <div id="container">
        <div class="player-list">
            <div
                    class="player-element"
                    v-for="player in playerList"
                    :key="player.id"
                    :style="getElementStyle(player)"
                    :class="getElementClasses(player)">
                <ion-icon
                        class="winning-icon"
                        v-if="player.id === winningPlayerID"
                        :md="winningIcon"
                        :ios="winningIcon">
                </ion-icon>
                <div class="row">
                    <div class="player-name">{{ player.name }}</div>
                    <div class="player-score">{{ player.score }} Punkte</div>
                </div>
                <div class="row">
                    <div class="player-strength">{{ player.getStrengthName() }}</div>
                    <div class="player-education">{{ player.getEducationName() }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
    import { defineComponent, computed } from 'vue';
    import { IonIcon } from '@ionic/vue';
    import { star, alarm } from 'ionicons/icons';

    export default defineComponent({
        name: "PlayerOverview",
        components: {
            IonIcon
        },
        props: {
            players: {
                required: true,
                type: Array
            },
            markWinner: {
                required: false,
                type: Boolean,
                default: false,
            },
            markLoser: {
                required: false,
                type: Boolean,
                default: false
            }
        },
        setup(props, context) {
            const playerList = computed(() => {
                const list = props.players;
                list.sort((a, b) => b.score - a.score)
                return list;
            });
            console.log(playerList.value);

            const winningPlayerID = computed(() => {
                return playerList.value[0].id;
            })

            const losingPlayerID = computed(() => {
                return playerList.value[playerList.value.length - 1].id;
            })

            function getElementClasses(player) {
                return {
                    'winning': player.id === winningPlayerID.value,
                    'losing': player.id === losingPlayerID.value,
                }
            }

            function getElementStyle(player) {
                return {'background-color': player.color};
            }

            return {
                winningIcon: star,
                playerList,
                winningPlayerID,
                losingPlayerID,
                getElementStyle,
                getElementClasses
            }
        }
    });
</script>

<style scoped>
    #container {
        padding: 20px;
        display: flex;
        flex-direction: column;
    }

    .player-list {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: stretch;
    }

    .player-element {
        padding: 10px;
        display: flex;
        flex-direction: column;
        border-radius: 5px;
        margin-bottom: 10px;
    }

    .row {
        display: flex;
        flex-direction: row;
        width: 100%;
        justify-content: space-between;
    }

    .player-name {
        font-size: 1.1em;
    }

    .player-strength, .player-education {
        font-variant: small-caps;
        font-size: 0.9em;
        color: dimgray;
    }

    .winning-icon {
        color: orange;
        background-color: white;
        padding: 2px;
        font-size: 1.1em;
        position: absolute;
        margin-top: -18px;
        margin-left: -18px;
        border-style: solid;
        border-width: 1px;
        border-color: gray;
        border-radius: 50%;
    }

</style>