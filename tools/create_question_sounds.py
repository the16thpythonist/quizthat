import os
import json
import shutil
import wave

import click
from espeakng import ESpeakNG

from util import PATH, ASSETS_PATH
from util import secho_info, secho_progress, secho_error

QUESTIONS_PATH = os.path.join(ASSETS_PATH, 'questions')
SPOKEN_PATH = os.path.join(ASSETS_PATH, 'spoken')


def text_to_speech(text: str,
                   dest_path: str = '',
                   voice: str = 'mb-de2',
                   pitch: int = 40,
                   speed: int = 180,
                   speak: bool = False) -> None:

    esng = ESpeakNG()
    esng.voice = voice
    esng.speed = speed
    esng.pitch = pitch
    if speak:
        esng.say(text)

    wav_bytes = esng.synth_wav(text)
    with open(dest_path, mode='wb') as file:
        file.write(wav_bytes)


# The general idea is that we iterate through the questions folder with an os.walk and we create a parallel
# structure of sound asset files, where each file has the same name as the question and is the
# text-to-speech sound for the question content...

@click.command()
def main():
    # First we make sure that we clear all the current sounds
    if os.path.exists(SPOKEN_PATH):
        shutil.rmtree(SPOKEN_PATH)
        secho_info(f'cleared the current sounds folder')
    else:
        secho_info(f'sounds folder does not exist')

    # Then we create that folder and start the os walk
    os.mkdir(SPOKEN_PATH)
    if os.path.exists(SPOKEN_PATH) and len(os.listdir(SPOKEN_PATH)) == 0:
        secho_progress('created a new folder for the question sounds')

    count = 0
    for root, dirs, files in os.walk(QUESTIONS_PATH):

        # if path diff is a dot that means that we currently walk the immediate questions folder. We dont
        # really want anything here so we skip that.
        path_diff = os.path.relpath(root, QUESTIONS_PATH)
        if path_diff == '.':
            continue
        # With this part here we first make sure that we create the current sub folder that we are walking
        # in the questions folder in the spoken folder as well so that we can then place the files there
        folder_path = os.path.join(SPOKEN_PATH, *path_diff.split('/'))
        if not os.path.exists(folder_path):
            os.mkdir(folder_path)

        for file_name in files:
            question_file_path = os.path.join(root, file_name)
            with open(question_file_path) as json_file:
                data = json.load(json_file)

            name, extension = file_name.split('.')
            sound_file_path = os.path.join(folder_path, f'{name}.wav')
            text_to_speech(
                text=data['content'],
                dest_path=sound_file_path
            )

            secho_info(f'file: "{name}"')
            count += 1

    secho_progress(f'processed {count} files')


if __name__ == '__main__':
    main()
    #text_to_speech('Wie lange hat es gedauert den Afrikanischen Kontinent zu finden?', './test.wav', speak=True)