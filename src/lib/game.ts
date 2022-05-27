/* eslint-disable */

import { Player } from '@/lib/player';
import { ref, reactive } from 'vue';

export class GameState {
    players: Record<string, Player>;
    playerOrder: Array<string>;
    currentIndex: number;
    currentPlayer: Player;

    roundIndex: number;

    constructor () {
        this.players = {};
        this.playerOrder = [];
        this.currentIndex = 0;
        this.currentPlayer = new Player();
        this.roundIndex = 0;
    }

    startGame() {
        this.playerOrder = Object.keys(this.players);
        this.currentIndex = 0;
        const playerId = this.playerOrder[this.currentIndex];
        this.currentPlayer = this.players[playerId];

        this.roundIndex = 1;
    }
}

export const STATE = reactive(new GameState())