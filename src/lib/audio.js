import { NativeAudio } from '@capacitor-community/native-audio';
import { OPTIONS } from '@/lib/options';


export class AudioController {

    sounds = {
        'correct_answer': {
            'path': 'public/assets/sounds/correct_answer.wav',
            'volume': 1,
        },
        'wrong_answer': {
            'path': 'public/assets/sounds/wrong_answer.mp3',
            'volume': 0.9,
        },
        'select': {
            'path': 'public/assets/sounds/select.wav',
            'volume': 0.8
        }
    };

    constructor() {
        for (const [key, data] of Object.entries(this.sounds)) {
            NativeAudio.preload({
                assetId: key,
                assetPath: data['path'],
                volume: data['volume'],
                isUrl: false
            })
        }
    }

    playSound(id) {
        if (OPTIONS.get('useAudio')) {
            NativeAudio.play({assetId: id});
        }
    }

    playCorrect() {
        this.playSound('correct_answer');
    }

    playWrong() {
        this.playSound('wrong_answer');
    }

    playSelect() {
        this.playSound('select');
    }

}

export const AUDIO = new AudioController();