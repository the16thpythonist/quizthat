/* disable eslint */
import { Storage } from '@ionic/storage';

class Options {

    storage: Storage;

    constructor() {
        this.storage = new Storage();
        this.storage.create().then(() => {
            console.log('STORAGE CREATED');
        });
    }

    public async get(key: string): Promise<any> {
        return await this.storage.get(key);
    }

    public set(key: string, value: any) {
        this.storage.set(key, value);
    }

}

export const OPTIONS = new Options();