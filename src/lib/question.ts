/* eslint-disable */

export class Question {
    name: string;
    teaser: string;
    topic: string;
    difficulty: number;
    content: string;

    constructor(
        name: string = '',
        teaser: string = '',
        topic: string = '',
        difficulty: number = 0,
        content: string = ''
    ) {
        this.name = name;
        this.teaser = teaser;
        this.topic = topic;
        this.difficulty = difficulty;
        this.content = content;
    }

    toString(): string {
        return `${this.topic}:${this.name}: ${this.content}`;
    }
}

export class MultipleChoiceQuestion extends Question {

    options: object;
    solution: string;

    constructor(
        name: string = '',
        teaser: string = '',
        topic: string = '',
        difficulty: number = 0,
        content: string = '',
        options: object = {},
        solution: string = '',
    ){
        super(name, teaser, topic, difficulty, content);
        this.options = options;
        this.solution = solution;
    }

}

const QUESTION_TYPES: Record<string, any> = {
    'multiple-choice': MultipleChoiceQuestion,
};

export function loadQuestion(topic: string | string[], name: string | string[]) {
    const path = `/assets/questions/${topic}/${name}.json`;
    return fetch(path).then((response) => {
        return response.json().then((data) => {
            const type: string = data.type;
            const klass = QUESTION_TYPES[type];
            data['topic'] = topic;
            data['name'] = name;
            const question = Object.assign(new klass(), data);
            return question;
        })
    })
}
