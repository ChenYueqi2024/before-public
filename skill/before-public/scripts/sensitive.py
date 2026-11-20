import json
import re
import unicodedata
from pathlib import Path
HERE=Path(__file__).resolve().parent
path=HERE/'runtime/sensitive-rules.json'
if not path.exists():path=HERE.parents[2]/'sensitive-rules.json'
PATTERNS=[(item['label'],re.compile(item['pattern'],re.I if 'i' in item['flags'] else 0)) for item in json.loads(path.read_text(encoding='utf-8'))]

def normalize(text,ocr=False):
    text=unicodedata.normalize('NFKC',text)
    if ocr:text=re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])','',text)
    return text

def detect(text,ocr=False):
    text=normalize(text,ocr);variants=[text,re.sub(r'[ \t]','',text)] if ocr else [text]
    return [label for label,pattern in PATTERNS if any(pattern.search(value) for value in variants)]

def redact_report(value):
    if isinstance(value,list):return [redact_report(item) for item in value]
    if isinstance(value,dict):return {key:('[sensitive path/location]' if key in {'path','location'} and isinstance(item,str) and detect(item) else redact_report(item)) for key,item in value.items()}
    return value
