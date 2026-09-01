#!/usr/bin/env python3
"""Create an initial test corpus of well-structured questions.

This script directly creates question folders using the pipeline's tools module,
bypassing the agent SDK (which requires API access).
"""

import os
import sys
import uuid

# Ensure the pipeline package is importable
sys.path.insert(0, os.path.dirname(__file__))

from quizthat.agent.tools import write_question_folder

QUESTIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "questions")
os.environ["QUIZTHAT_QUESTIONS_DIR"] = QUESTIONS_DIR


def short_id() -> str:
    return uuid.uuid4().hex[:8]


# ============================================================
# MULTIPLE CHOICE questions (~10)
# ============================================================

MULTIPLE_CHOICE_QUESTIONS = [
    # 1. Science / Physics / easy
    {
        "id": short_id(),
        "meta": {
            "major_category": "Science",
            "subcategory": "Physics",
            "difficulty": "easy",
            "question_type": "multiple_choice",
        },
        "en": {
            "teaser_title": "The Speed of Light",
            "question_text": "In a vacuum, approximately how fast does light travel per second?",
            "hint": "It is the universal speed limit and nothing with mass can reach it.",
            "answer_data": {
                "options": [
                    "300,000 km/s",
                    "150,000 km/s",
                    "1,000,000 km/s",
                    "30,000 km/s",
                ],
                "correct_index": 0,
            },
        },
        "de": {
            "teaser_title": "Lichtgeschwindigkeit",
            "question_text": "Wie schnell bewegt sich Licht im Vakuum pro Sekunde (ungefaehr)?",
            "hint": "Es ist die universelle Geschwindigkeitsbegrenzung und nichts mit Masse kann sie erreichen.",
            "answer_data": {
                "options": [
                    "300.000 km/s",
                    "150.000 km/s",
                    "1.000.000 km/s",
                    "30.000 km/s",
                ],
                "correct_index": 0,
            },
        },
        "research": "The speed of light in vacuum is exactly 299,792,458 m/s, approximately 300,000 km/s. Source: NIST.",
    },
    # 2. History / Modern / medium
    {
        "id": short_id(),
        "meta": {
            "major_category": "History",
            "subcategory": "Modern History",
            "difficulty": "medium",
            "question_type": "multiple_choice",
        },
        "en": {
            "teaser_title": "The Wall Comes Down",
            "question_text": "In which year did the Berlin Wall fall?",
            "hint": "It happened during a press conference that spiraled out of control.",
            "answer_data": {
                "options": ["1989", "1991", "1987", "1990"],
                "correct_index": 0,
            },
        },
        "de": {
            "teaser_title": "Die Mauer faellt",
            "question_text": "In welchem Jahr fiel die Berliner Mauer?",
            "hint": "Es passierte waehrend einer Pressekonferenz, die ausser Kontrolle geriet.",
            "answer_data": {
                "options": ["1989", "1991", "1987", "1990"],
                "correct_index": 0,
            },
        },
        "research": "The Berlin Wall fell on November 9, 1989. The opening was triggered by a press conference by Guenter Schabowski. Source: German Historical Museum.",
    },
    # 3. Geography / Countries / easy
    {
        "id": short_id(),
        "meta": {
            "major_category": "Geography",
            "subcategory": "Countries",
            "difficulty": "easy",
            "question_type": "multiple_choice",
        },
        "en": {
            "teaser_title": "The Land Down Under",
            "question_text": "What is the capital city of Australia?",
            "hint": "It is not the largest city in the country.",
            "answer_data": {
                "options": ["Canberra", "Sydney", "Melbourne", "Brisbane"],
                "correct_index": 0,
            },
        },
        "de": {
            "teaser_title": "Am anderen Ende der Welt",
            "question_text": "Was ist die Hauptstadt von Australien?",
            "hint": "Es ist nicht die groesste Stadt des Landes.",
            "answer_data": {
                "options": ["Canberra", "Sydney", "Melbourne", "Brisbane"],
                "correct_index": 0,
            },
        },
        "research": "Canberra is the capital of Australia, chosen as a compromise between Sydney and Melbourne. Source: Australian Government.",
    },
    # 4. Arts & Culture / Literature / medium
    {
        "id": short_id(),
        "meta": {
            "major_category": "Arts & Culture",
            "subcategory": "Literature",
            "difficulty": "medium",
            "question_type": "multiple_choice",
        },
        "en": {
            "teaser_title": "The Danish Prince",
            "question_text": "Who wrote the play 'Hamlet'?",
            "hint": "This playwright was born in Stratford-upon-Avon.",
            "answer_data": {
                "options": [
                    "William Shakespeare",
                    "Christopher Marlowe",
                    "Ben Jonson",
                    "John Milton",
                ],
                "correct_index": 0,
            },
        },
        "de": {
            "teaser_title": "Der daenische Prinz",
            "question_text": "Wer schrieb das Theaterstueck 'Hamlet'?",
            "hint": "Dieser Dramatiker wurde in Stratford-upon-Avon geboren.",
            "answer_data": {
                "options": [
                    "William Shakespeare",
                    "Christopher Marlowe",
                    "Ben Jonson",
                    "John Milton",
                ],
                "correct_index": 0,
            },
        },
        "research": "Hamlet was written by William Shakespeare around 1600-1601. Source: Folger Shakespeare Library.",
    },
    # 5. Technology / Computing / hard
    {
        "id": short_id(),
        "meta": {
            "major_category": "Technology",
            "subcategory": "Computing",
            "difficulty": "hard",
            "question_type": "multiple_choice",
        },
        "en": {
            "teaser_title": "The First Bug",
            "question_text": "In which year was the first actual computer bug (a moth) found in a relay of the Harvard Mark II?",
            "hint": "Grace Hopper's team documented this famous incident.",
            "answer_data": {
                "options": ["1947", "1952", "1943", "1955"],
                "correct_index": 0,
            },
        },
        "de": {
            "teaser_title": "Der erste Bug",
            "question_text": "In welchem Jahr wurde der erste tatsaechliche Computer-Bug (eine Motte) in einem Relais des Harvard Mark II gefunden?",
            "hint": "Grace Hoppers Team dokumentierte diesen beruehmten Vorfall.",
            "answer_data": {
                "options": ["1947", "1952", "1943", "1955"],
                "correct_index": 0,
            },
        },
        "research": "On September 9, 1947, a moth was found trapped in a relay of the Harvard Mark II computer. It was taped into the log book. Source: Smithsonian National Museum of American History.",
    },
    # 6. Nature / Animals / easy
    {
        "id": short_id(),
        "meta": {
            "major_category": "Nature",
            "subcategory": "Animals",
            "difficulty": "easy",
            "question_type": "multiple_choice",
        },
        "en": {
            "teaser_title": "Gentle Giants",
            "question_text": "What is the largest animal to have ever lived on Earth?",
            "hint": "This animal is still alive today and lives in the ocean.",
            "answer_data": {
                "options": [
                    "Blue whale",
                    "African elephant",
                    "Tyrannosaurus rex",
                    "Colossal squid",
                ],
                "correct_index": 0,
            },
        },
        "de": {
            "teaser_title": "Sanfte Riesen",
            "question_text": "Was ist das groesste Tier, das jemals auf der Erde gelebt hat?",
            "hint": "Dieses Tier lebt noch heute und ist im Ozean zu finden.",
            "answer_data": {
                "options": [
                    "Blauwal",
                    "Afrikanischer Elefant",
                    "Tyrannosaurus Rex",
                    "Koloss-Kalmar",
                ],
                "correct_index": 0,
            },
        },
        "research": "The blue whale (Balaenoptera musculus) is the largest animal ever known. Adults can reach up to 30m in length. Source: NOAA.",
    },
    # 7. Sports / Olympics / medium
    {
        "id": short_id(),
        "meta": {
            "major_category": "Sports",
            "subcategory": "Olympics",
            "difficulty": "medium",
            "question_type": "multiple_choice",
        },
        "en": {
            "teaser_title": "Olympic Rings",
            "question_text": "How many rings are on the Olympic flag, and what do they represent?",
            "hint": "Count the continents, but group the Americas together.",
            "answer_data": {
                "options": [
                    "5 rings, representing the five continents",
                    "6 rings, representing the six inhabited continents",
                    "4 rings, representing the four cardinal directions",
                    "7 rings, representing the seven continents",
                ],
                "correct_index": 0,
            },
        },
        "de": {
            "teaser_title": "Olympische Ringe",
            "question_text": "Wie viele Ringe befinden sich auf der olympischen Flagge, und was stellen sie dar?",
            "hint": "Zaehle die Kontinente, aber fasse Amerika zusammen.",
            "answer_data": {
                "options": [
                    "5 Ringe, fuer die fuenf Kontinente",
                    "6 Ringe, fuer die sechs bewohnten Kontinente",
                    "4 Ringe, fuer die vier Himmelsrichtungen",
                    "7 Ringe, fuer die sieben Kontinente",
                ],
                "correct_index": 0,
            },
        },
        "research": "The Olympic flag has 5 interlocking rings representing Africa, the Americas, Asia, Europe, and Oceania. Source: IOC.",
    },
    # 8. Pop Culture / Music / hard
    {
        "id": short_id(),
        "meta": {
            "major_category": "Pop Culture",
            "subcategory": "Popular Music",
            "difficulty": "hard",
            "question_type": "multiple_choice",
        },
        "en": {
            "teaser_title": "Dark Side",
            "question_text": "How many consecutive weeks did Pink Floyd's 'The Dark Side of the Moon' spend on the Billboard 200 chart?",
            "hint": "The number is in the hundreds and spans over a decade.",
            "answer_data": {
                "options": ["591", "741", "420", "352"],
                "correct_index": 0,
            },
        },
        "de": {
            "teaser_title": "Die dunkle Seite",
            "question_text": "Wie viele aufeinanderfolgende Wochen war Pink Floyds 'The Dark Side of the Moon' in den Billboard-200-Charts?",
            "hint": "Die Zahl liegt im Hunderterbereich und umfasst ueber ein Jahrzehnt.",
            "answer_data": {
                "options": ["591", "741", "420", "352"],
                "correct_index": 0,
            },
        },
        "research": "The Dark Side of the Moon spent 591 consecutive weeks on the Billboard 200 (1973-1988). Total chart appearances exceed 950 weeks. Source: Billboard.",
    },
    # 9. Food & Drink / World Cuisine / easy
    {
        "id": short_id(),
        "meta": {
            "major_category": "Food & Drink",
            "subcategory": "World Cuisine",
            "difficulty": "easy",
            "question_type": "multiple_choice",
        },
        "en": {
            "teaser_title": "Rising Dough",
            "question_text": "Which country is considered the birthplace of pizza?",
            "hint": "Naples is the specific city where the modern version was born.",
            "answer_data": {
                "options": ["Italy", "Greece", "Turkey", "Spain"],
                "correct_index": 0,
            },
        },
        "de": {
            "teaser_title": "Aufgehender Teig",
            "question_text": "Welches Land gilt als Geburtsstaette der Pizza?",
            "hint": "Neapel ist die Stadt, in der die moderne Version entstand.",
            "answer_data": {
                "options": ["Italien", "Griechenland", "Tuerkei", "Spanien"],
                "correct_index": 0,
            },
        },
        "research": "Modern pizza originated in Naples, Italy, in the late 18th century. The Margherita pizza was created in 1889. Source: UNESCO Intangible Cultural Heritage.",
    },
    # 10. Mythology / Greek / medium
    {
        "id": short_id(),
        "meta": {
            "major_category": "Mythology",
            "subcategory": "Greek Mythology",
            "difficulty": "medium",
            "question_type": "multiple_choice",
        },
        "en": {
            "teaser_title": "The Twelve Labors",
            "question_text": "Which Greek hero was forced to complete twelve seemingly impossible labors as penance?",
            "hint": "He was the son of Zeus and known for his extraordinary strength.",
            "answer_data": {
                "options": ["Heracles", "Perseus", "Theseus", "Achilles"],
                "correct_index": 0,
            },
        },
        "de": {
            "teaser_title": "Die zwoelf Aufgaben",
            "question_text": "Welcher griechische Held musste zwoelf scheinbar unmoegliche Aufgaben als Busse erfuellen?",
            "hint": "Er war der Sohn des Zeus und bekannt fuer seine aussergewoehnliche Staerke.",
            "answer_data": {
                "options": ["Herakles", "Perseus", "Theseus", "Achilles"],
                "correct_index": 0,
            },
        },
        "research": "Heracles (Hercules in Roman mythology) completed 12 labors for King Eurystheus as penance for killing his family in a fit of madness induced by Hera. Source: Apollodorus' Bibliotheca.",
    },
]


# ============================================================
# SORTING questions (~3)
# ============================================================

SORTING_QUESTIONS = [
    # 1. Geography / Rivers / medium
    {
        "id": short_id(),
        "meta": {
            "major_category": "Geography",
            "subcategory": "Rivers & Lakes",
            "difficulty": "medium",
            "question_type": "sorting",
        },
        "en": {
            "teaser_title": "River Run",
            "question_text": "Sort these rivers from longest to shortest.",
            "hint": "The longest one flows through northeastern Africa.",
            "answer_data": {
                "items": ["Nile", "Amazon", "Yangtze", "Mississippi"],
                "correct_order": [0, 1, 2, 3],
                "metric": "length in km",
            },
        },
        "de": {
            "teaser_title": "Flusslaeufe",
            "question_text": "Sortiere diese Fluesse vom laengsten zum kuerzesten.",
            "hint": "Der laengste fliesst durch Nordostafrika.",
            "answer_data": {
                "items": ["Nil", "Amazonas", "Jangtsekiang", "Mississippi"],
                "correct_order": [0, 1, 2, 3],
                "metric": "Laenge in km",
            },
        },
        "research": "Nile: ~6,650 km, Amazon: ~6,400 km, Yangtze: ~6,300 km, Mississippi: ~3,730 km. Source: World Atlas.",
    },
    # 2. Science / Astronomy / hard
    {
        "id": short_id(),
        "meta": {
            "major_category": "Science",
            "subcategory": "Astronomy",
            "difficulty": "hard",
            "question_type": "sorting",
        },
        "en": {
            "teaser_title": "Planetary Parade",
            "question_text": "Sort these planets from closest to farthest from the Sun.",
            "hint": "The smallest planet is also the closest.",
            "answer_data": {
                "items": ["Mercury", "Earth", "Jupiter", "Neptune"],
                "correct_order": [0, 1, 2, 3],
                "metric": "distance from Sun",
            },
        },
        "de": {
            "teaser_title": "Planetenparade",
            "question_text": "Sortiere diese Planeten vom naechsten zum entferntesten von der Sonne.",
            "hint": "Der kleinste Planet ist auch der naechste.",
            "answer_data": {
                "items": ["Merkur", "Erde", "Jupiter", "Neptun"],
                "correct_order": [0, 1, 2, 3],
                "metric": "Entfernung von der Sonne",
            },
        },
        "research": "Mercury: 0.39 AU, Earth: 1.0 AU, Jupiter: 5.2 AU, Neptune: 30.1 AU. Source: NASA.",
    },
    # 3. History / World Wars / medium
    {
        "id": short_id(),
        "meta": {
            "major_category": "History",
            "subcategory": "World Wars",
            "difficulty": "medium",
            "question_type": "sorting",
        },
        "en": {
            "teaser_title": "Timeline of Conflict",
            "question_text": "Sort these World War II events in chronological order.",
            "hint": "The invasion of Poland started it all.",
            "answer_data": {
                "items": [
                    "Invasion of Poland",
                    "Attack on Pearl Harbor",
                    "D-Day (Normandy)",
                    "Hiroshima bombing",
                ],
                "correct_order": [0, 1, 2, 3],
                "metric": "chronological order",
            },
        },
        "de": {
            "teaser_title": "Zeitstrahl des Konflikts",
            "question_text": "Sortiere diese Ereignisse des Zweiten Weltkriegs in chronologischer Reihenfolge.",
            "hint": "Der Ueberfall auf Polen war der Anfang.",
            "answer_data": {
                "items": [
                    "Ueberfall auf Polen",
                    "Angriff auf Pearl Harbor",
                    "D-Day (Normandie)",
                    "Atombombe auf Hiroshima",
                ],
                "correct_order": [0, 1, 2, 3],
                "metric": "chronologische Reihenfolge",
            },
        },
        "research": "Poland invasion: Sep 1939, Pearl Harbor: Dec 1941, D-Day: Jun 1944, Hiroshima: Aug 1945. Source: Encyclopedia Britannica.",
    },
]


# ============================================================
# MAP LOCATION questions (~3)
# ============================================================

MAP_LOCATION_QUESTIONS = [
    # 1. Geography / Capitals / easy
    {
        "id": short_id(),
        "meta": {
            "major_category": "Geography",
            "subcategory": "Capitals & Cities",
            "difficulty": "easy",
            "question_type": "map_location",
        },
        "en": {
            "teaser_title": "City of Light",
            "question_text": "Point to the location of Paris, France on the map.",
            "hint": "It sits on the River Seine in northern France.",
            "answer_data": {
                "target": {"lat": 48.8566, "lng": 2.3522},
                "scoring": [
                    {"radius_km": 50, "label": "exact"},
                    {"radius_km": 200, "label": "close"},
                    {"radius_km": 500, "label": "region"},
                ],
            },
        },
        "de": {
            "teaser_title": "Stadt des Lichts",
            "question_text": "Zeige auf der Karte, wo Paris, Frankreich liegt.",
            "hint": "Es liegt an der Seine in Nordfrankreich.",
            "answer_data": {
                "target": {"lat": 48.8566, "lng": 2.3522},
                "scoring": [
                    {"radius_km": 50, "label": "exact"},
                    {"radius_km": 200, "label": "close"},
                    {"radius_km": 500, "label": "region"},
                ],
            },
        },
        "research": "Paris coordinates: 48.8566 N, 2.3522 E. Source: GeoNames.",
    },
    # 2. Geography / Mountains / medium
    {
        "id": short_id(),
        "meta": {
            "major_category": "Geography",
            "subcategory": "Mountains",
            "difficulty": "medium",
            "question_type": "map_location",
        },
        "en": {
            "teaser_title": "Top of the World",
            "question_text": "Point to the location of Mount Everest on the map.",
            "hint": "It straddles the border between Nepal and Tibet.",
            "answer_data": {
                "target": {"lat": 27.9881, "lng": 86.9250},
                "scoring": [
                    {"radius_km": 50, "label": "exact"},
                    {"radius_km": 200, "label": "close"},
                    {"radius_km": 500, "label": "region"},
                ],
            },
        },
        "de": {
            "teaser_title": "Auf dem Dach der Welt",
            "question_text": "Zeige auf der Karte, wo der Mount Everest liegt.",
            "hint": "Er liegt an der Grenze zwischen Nepal und Tibet.",
            "answer_data": {
                "target": {"lat": 27.9881, "lng": 86.9250},
                "scoring": [
                    {"radius_km": 50, "label": "exact"},
                    {"radius_km": 200, "label": "close"},
                    {"radius_km": 500, "label": "region"},
                ],
            },
        },
        "research": "Mount Everest coordinates: 27.9881 N, 86.9250 E. Height: 8,849m. Source: Survey Department of Nepal.",
    },
    # 3. History / Ancient / hard
    {
        "id": short_id(),
        "meta": {
            "major_category": "History",
            "subcategory": "Ancient History",
            "difficulty": "hard",
            "question_type": "map_location",
        },
        "en": {
            "teaser_title": "Eternal City",
            "question_text": "Point to the location of the ancient city of Rome on the map.",
            "hint": "Legend says it was founded by Romulus on seven hills.",
            "answer_data": {
                "target": {"lat": 41.9028, "lng": 12.4964},
                "scoring": [
                    {"radius_km": 50, "label": "exact"},
                    {"radius_km": 200, "label": "close"},
                    {"radius_km": 500, "label": "region"},
                ],
            },
        },
        "de": {
            "teaser_title": "Die ewige Stadt",
            "question_text": "Zeige auf der Karte, wo das antike Rom liegt.",
            "hint": "Der Legende nach wurde es von Romulus auf sieben Huegeln gegruendet.",
            "answer_data": {
                "target": {"lat": 41.9028, "lng": 12.4964},
                "scoring": [
                    {"radius_km": 50, "label": "exact"},
                    {"radius_km": 200, "label": "close"},
                    {"radius_km": 500, "label": "region"},
                ],
            },
        },
        "research": "Rome coordinates: 41.9028 N, 12.4964 E. Traditional founding date: 753 BC. Source: Encyclopedia Britannica.",
    },
]


# ============================================================
# CALCULATION questions (~2)
# ============================================================

CALCULATION_QUESTIONS = [
    # 1. Math & Logic / Numbers / medium
    {
        "id": short_id(),
        "meta": {
            "major_category": "Math & Logic",
            "subcategory": "Numbers & Constants",
            "difficulty": "medium",
            "question_type": "calculation",
        },
        "en": {
            "teaser_title": "Circle Constant",
            "question_text": "What is the value of Pi (to two decimal places)?",
            "hint": "It is the ratio of a circle's circumference to its diameter.",
            "answer_data": {
                "correct_value": 3.14,
                "tolerance": 0.01,
                "unit": "",
            },
        },
        "de": {
            "teaser_title": "Kreiskonstante",
            "question_text": "Was ist der Wert von Pi (auf zwei Dezimalstellen)?",
            "hint": "Es ist das Verhaeltnis des Umfangs eines Kreises zu seinem Durchmesser.",
            "answer_data": {
                "correct_value": 3.14,
                "tolerance": 0.01,
                "unit": "",
            },
        },
        "research": "Pi = 3.14159265358979... Source: Mathematics.",
    },
    # 2. Science / Earth Science / hard
    {
        "id": short_id(),
        "meta": {
            "major_category": "Science",
            "subcategory": "Earth Science",
            "difficulty": "hard",
            "question_type": "calculation",
        },
        "en": {
            "teaser_title": "Our Pale Blue Dot",
            "question_text": "What is the approximate mean radius of the Earth in kilometers?",
            "hint": "It is a bit over 6,000 km but less than 7,000 km.",
            "answer_data": {
                "correct_value": 6371,
                "tolerance": 0.02,
                "unit": "km",
            },
        },
        "de": {
            "teaser_title": "Unser blasser blauer Punkt",
            "question_text": "Wie gross ist der ungefaehre mittlere Radius der Erde in Kilometern?",
            "hint": "Er ist etwas ueber 6.000 km, aber unter 7.000 km.",
            "answer_data": {
                "correct_value": 6371,
                "tolerance": 0.02,
                "unit": "km",
            },
        },
        "research": "Earth's mean radius is 6,371 km. Source: NASA Earth Fact Sheet.",
    },
]


def main():
    all_questions = (
        MULTIPLE_CHOICE_QUESTIONS
        + SORTING_QUESTIONS
        + MAP_LOCATION_QUESTIONS
        + CALCULATION_QUESTIONS
    )

    print(f"Creating {len(all_questions)} test questions...")

    for q in all_questions:
        question_dir = write_question_folder(
            question_id=q["id"],
            meta=q["meta"],
            question_en=q.get("en"),
            question_de=q.get("de"),
            research_notes=q.get("research", ""),
            batch_id="test-corpus-initial",
        )
        qtype = q["meta"]["question_type"]
        diff = q["meta"]["difficulty"]
        title = q.get("en", {}).get("teaser_title", "")
        print(f"  Created: {question_dir.name}  [{qtype}/{diff}]  {title}")

    print(f"\nDone! {len(all_questions)} questions created in {QUESTIONS_DIR}")


if __name__ == "__main__":
    main()
