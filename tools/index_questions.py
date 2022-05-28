import os
import json
import pathlib
from collections import defaultdict
from pprint import pprint

PATH = pathlib.Path(__file__).parent.absolute()
PROJECT_PATH = os.path.dirname(PATH)
ASSETS_PATH = os.path.join(PROJECT_PATH, 'public', 'assets')

questions = {}

questions_path = os.path.join(ASSETS_PATH, 'questions')
for root, folders, files in os.walk(questions_path):

    for folder in folders:
        folder_path = os.path.join(root, folder)
        questions[folder] = []

        for _root, _folders, _files in os.walk(folder_path):
            for file_name in _files:
                name, extension = file_name.split('.')
                questions[folder].append(name)

            break

    break


json_path = os.path.join(ASSETS_PATH, 'questions.json')
with open(json_path, mode='w') as json_file:
    json.dump(questions, json_file, indent=4, sort_keys=True)


