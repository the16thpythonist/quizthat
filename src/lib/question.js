/* eslint-disable */
import { NativeAudio } from "@capacitor-community/native-audio";
import { OPTIONS } from "@/lib/options";


export const TOPIC_NAMES = {
    'mathematics': 'Mathematik',
    'physics': 'Physik',
    'technology': 'Technologie',
    'sports': 'Sport',
    'history': 'Geschichte',
    'geography': 'Geographie',
    'culture': 'Kultur',
    'internet': 'Internetkultur',
    'gaming': 'Gaming'
}

export const QUESTION_TYPE_NAMES = {
    'multiple-choice': 'Multiple Choice'
}

export class Question {
    name;
    teaser;
    topic;
    difficulty;
    content;
    type;
    details;

    constructor(
        name = '',
        teaser = '',
        topic = '',
        difficulty = '0',
        content = '',
        details = ''
    ) {
        this.name = name;
        this.teaser = teaser;
        this.topic = topic;
        this.difficulty = difficulty;
        this.content = content;
        this.details = details;
        this.type = '';
    }

    toString() {
        return `${this.topic}:${this.name}: ${this.content}`;
    }

    getPoints() {
        return parseInt(this.difficulty);
    }

    getTopicName() {
        return TOPIC_NAMES[this.topic];
    }

    getTypeName() {
        return QUESTION_TYPE_NAMES[this.type];
    }

    prepareAudio() {
            NativeAudio.preload({
                assetId: this.name,
                assetPath: `public/assets/spoken/${this.topic}/${this.name}.wav`,
                audioChannelNum: 1,
                volume: 1.0,
                isUrl: false
            });

    }

    playAudio() {
            NativeAudio.play({
                assetId: this.name
            });
    }

    close() {
        return;
    }

}

export class MultipleChoiceQuestion extends Question {

    options;
    solution;

    constructor(
        name = '',
        teaser = '',
        topic = '',
        difficulty = '0',
        content = '',
        options= {},
        solution = '',
    ){
        super(name, teaser, topic, difficulty, content);
        this.options = options;
        this.solution = solution;
    }

}

export const QUESTION_TYPES = {
    'multiple-choice': MultipleChoiceQuestion,
};

export function loadQuestion(topic, name) {
    const path = `/assets/questions/${topic}/${name}.json`;
    return fetch(path).then((response) => {
        return response.json().then((data) => {
            const type = data.type;
            const klass = QUESTION_TYPES[type];
            data['topic'] = topic;
            data['name'] = name;
            const question = Object.assign(new klass(), data);
            return question;
        })
    })
}
