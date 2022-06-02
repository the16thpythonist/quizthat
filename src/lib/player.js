/* eslint-disable */
export const STRENGTH_NAMES = {
    'science': 'Wissenschaft',
    'sports': 'Sport',
    'facts': 'Allgemeinwissen',
    'culture': 'Kultur',
}

export const STRENGTH_TOPICS = {
    'science': ['mathematics', 'physics'],
    'sports': ['sports'],
    'facts': ['geography', 'history'],
    'culture': ['culture'],
}

export const EDUCATION_NAMES = {
    '1': 'Grundschule',
    '2': 'Abitur'
}


export class Player {

    id;
    name;
    color;
    strength;
    education;
    score;

    constructor(
        name = '',
        color = '#000000',
        strength = '',
        education = 0,
        score = 0,
    ) {
        // The id is a randomly generated unique string which identifies the player. This makes it possible to have
        // players with the same name.
        this.id = Math.random().toString(36).substring(8);
        console.log(`constructed player: ${this.id}`)
        this.name = name;
        this.color = color;
        this.strength = strength;
        this.education = education;
        this.score = score;
    }

    getStrength() {
        return STRENGTH_NAMES[this.strength];
    }

    getStrengthName() {
        return STRENGTH_NAMES[this.strength];
    }

    getEducation() {
        return EDUCATION_NAMES[this.education];
    }

    getEducationName() {
        return EDUCATION_NAMES[this.education];
    }
}