/* eslint-disable */

import { Player, STRENGTH_TOPICS } from '@/lib/player';
import {loadQuestion, Question} from '@/lib/question';
import { OPTIONS } from "@/lib/options";
import { ref, reactive } from 'vue';


function sampleArray(arr, k = 3) {
    let shuffled = arr.slice(0);
    let i = arr.length;
    let temp, index;
    while (i--) {
        index = Math.floor((i + 1) * Math.random());
        temp = shuffled[index];
        shuffled[index] = shuffled[i];
        shuffled[i] = temp
    }
    return shuffled.slice(0, k);
}


export class GameState {
    isRunning;

    players;
    playerOrder;
    currentIndex;
    currentPlayer;

    currentPath;

    questions;
    topics;

    roundLimit;
    roundIndex;

    constructor () {
        this.isRunning = false;
        this.players = {};
        this.playerOrder = [];
        this.currentIndex = 0;
        this.currentPlayer = new Player();
        this.currentPath = '';
        this.roundIndex = 0;
        this.roundLimit = 0;

        // Now, I just found out that the "assets" are not actually a filesystem thing but instead it just
        // kind of simulates a filesystem while all the assets are actually bundled into the binary itself.
        // Most importantly this means I can't actually dynamically determine list of all the available
        // question JSON files...
        // So instead I wrote a script which does this on build time and bundles the lists of all question
        // files into an additional JSON asset, which I will load here into the "questions" field.
        this.questions = {};
        this.topics = [];
        let self = this;
        fetch('/assets/questions.json').then((response) => {
            response.json().then((data) => {
                self.questions = data;
                self.topics = Object.keys(data);
        })
    })
    }

    startGame() {
        this.isRunning = true;
        this.playerOrder = Object.keys(this.players);
        this.currentIndex = 0;
        const playerId = this.playerOrder[this.currentIndex];
        this.currentPlayer = this.players[playerId];

        this.roundIndex = 1;
        this.roundLimit = OPTIONS.get('rounds');
    }

    endGame() {
        this.isRunning = false;
        this.playerOrder = [];
        this.currentIndex = 0;
        this.players = {}
    }

    nextPlayer(player = this.currentPlayer) {
        let found = false;
        for(let playerId of [...this.playerOrder, ...this.playerOrder]) {
            if (found) {
                return this.players[playerId];
            }
            if (playerId === player.id) {
                found = true;
            }
        }
        return player;
    }

    sampleQuestions(player, k) {
        // First of all we need to determine the topics for the questions.
        let randomTopics = sampleArray(this.topics, k);
        let strengthTopics = sampleArray(STRENGTH_TOPICS[player.strength], k);
        let topics = [...randomTopics, ...strengthTopics];

        let questions = [];
        for (let topic of topics) {
            let index = Math.floor((this.questions[topic].length) * Math.random())
            let name = this.questions[topic][index];
            questions.push(`${topic}|${name}`);
        }

        return sampleArray(questions, k);
    }

    nextPath()  {
        // First of we increment the player. This may of may not cause the increment of the round index as well.
        if (this.currentIndex === this.playerOrder.length - 1) {
            this.roundIndex += 1;

            if (this.roundIndex >= this.roundLimit) {
                // End
                return '/end';
            } else {
                // reset to the first player
                this.currentIndex = 0;
            }
        } else {
            this.currentIndex += 1;
        }

        let playerId = this.playerOrder[this.currentIndex];
        this.currentPlayer = this.players[playerId];
        return this.choicePath(this.currentPlayer);
    }

    choicePath(player) {
        const questions = this.sampleQuestions(player);
        const questionString = questions.map((q) => `questions=${q}`).join('&');
        const id = (Math.random() + 1).toString(36).substring(4);
        let path =  `/choice/${player.id}/${id}/?${questionString}`;

        return path;
    }

    questionPath(player, question) {
        const id = (Math.random() + 1).toString(36).substring(4);
        const path = `/question/${question.topic}/${question.name}/${id}?playerId=${player.id}&isOpen=true`
        return path;
    }
}

export const STATE = reactive(new GameState());