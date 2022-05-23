/* eslint-disable */
export const STRENGTHS = {
    'science': 'Wissenschaft',
    'sports': 'Sport',
    'geography': 'Geographie',
    'history': 'Geschichte',
    'culture': 'Kultur',
}

export const EDUCATIONS = {
    '1': 'Grundschule',
    '2': 'Abitur'
}


export class Player {
    id: string;
    name: string;
    color: string;
    strength: string;
    education: number;
    score: number;

    constructor(
        name: string = '',
        color: string = '#000000',
        strength: string = '',
        education: number = 0,
        score: number = 0,
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
}