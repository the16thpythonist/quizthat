/* eslint-disable */
import { ref, watch } from 'vue';
import { Storage } from '@ionic/storage';

class Options {

    storage;

    config = {
        'rounds': {
            'default': 3,
            'encode': (v) => {return v.toString()},
            'decode': (v) => {return parseInt(v)},
            'ref': ref(null),
            'inputType': 'number',
            'label': 'Rundenanzahl'
        },
        'useAudio': {
            'default': true,
            'encode': (v) => {return v.toString()},
            'decode': (v) => {return v === 'true'},
            'ref': ref(null),
            'inputType': 'boolean',
            'label': 'Nutze Soundeffekte',
        },
        'useSpoken': {
            'default': true,
            'encode': (v) => {return v.toString()},
            'decode': (v) => {return v === 'true'},
            'ref': ref(null),
            'inputType': 'boolean',
            'label': 'Fragen Vorlesen',
        }
    }

    constructor() {
        const self = this;
        this.storage = new Storage();
        this.storage.create().then(() => {
            self.storage.keys().then((keys) => {

                // Now we need to set default values if they are not already set
                const missingKeys = Object.keys(self.config).filter(x => !keys.includes(x));
                for (const key of missingKeys) {
                    const data = self.config[key];
                    self.storage.set(key, data['default']);
                    console.log(`setting default value: ${key} - ${data['default']}`);
                }

                // After the potential setting of the default values we load all of the values from the
                // persistent storage into Vue ref's. This is because the main storage only allows us to
                // get and set the values through async functions / Promises and that is a huge pain in the
                // ass. We will load the values into the refs here once and then attach watchers to those
                // refs which will change the persistent values whenever the ref value changes as well.
                // Like this we will hopefully never get the problem that the persistent version and the
                // in-memory version of a value deviate.
                for (const [key, data] of Object.entries(self.config)) {
                    self.storage.get(key).then((value) => {
                        const decoded = self.config[key]['decode'](value);
                        data['ref'].value = decoded;
                        console.log(key, value, decoded, data['ref'].value);
                        watch(data['ref'], (newValue, oldValue) => {
                            const encoded = self.config[key]['encode'](newValue);
                            console.log(newValue, encoded);
                            self.storage.set(key, encoded);
                        });
                    })
                }
            })
        });
    }

    getRef(key) {
        return this.config[key]['ref'];
    }

    get(key) {
        return this.config[key]['ref'].value;
    }

    set(key, value) {
        this.config[key]['ref'].value = value;
    }

}

export const OPTIONS = new Options();