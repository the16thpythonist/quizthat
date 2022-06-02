import os
import json
import click
from collections import defaultdict
from pprint import pprint

from util import PATH, ASSETS_PATH
from util import secho_info, secho_progress, secho_error

questions = {}


@click.command()
def main():
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


if __name__ == '__main__':
    main()
