/* eslint-disable */

import { Player } from '@/lib/player';
import { ref, reactive } from 'vue';

export class GameState {
    players: Record<string, Player>;

    constructor () {
        this.players = {};
    }
}

export const STATE = reactive(new GameState())