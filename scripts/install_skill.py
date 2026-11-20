"""Install the skill or create its portable ZIP; never bundles user rules/reports."""
import argparse
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def build(destination):
    shutil.copytree(ROOT/'skill/before-public',destination,ignore=shutil.ignore_patterns('runtime','__pycache__','.venv'))
    runtime=destination/'scripts/runtime'
    shutil.copytree(ROOT/'before_public',runtime/'before_public',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    shutil.copyfile(ROOT/'docs/vendor/documents/word-xml.js',runtime/'word-xml.mjs')
    shutil.copyfile(ROOT/'docs/vendor/documents/LICENSES.txt',runtime/'THIRD_PARTY_LICENSES.txt')
    shutil.copyfile(ROOT/'LICENSE',runtime/'LICENSE')
    shutil.copyfile(ROOT/'sensitive-rules.json',runtime/'sensitive-rules.json')
    shutil.copytree(ROOT/'docs/vendor/ocr/lang',runtime/'ocr/lang')
    shutil.copyfile(ROOT/'docs/vendor/ocr/LICENSES.txt',runtime/'ocr/LICENSES.txt')
    shutil.copytree(ROOT/'scripts/ocr-runtime',runtime/'ocr-node',ignore=shutil.ignore_patterns('node_modules'))

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--destination');parser.add_argument('--package');parser.add_argument('--update',action='store_true');args=parser.parse_args()
    if args.package:
        output=Path(args.package).resolve();output.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory() as folder:
            skill=Path(folder)/'before-public';build(skill)
            with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as archive:
                for file in sorted(skill.rglob('*')):
                    if file.is_file():
                        info=zipfile.ZipInfo(file.relative_to(Path(folder)).as_posix(),date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(info,file.read_bytes())
        print('Portable skill ZIP created.');return
    destination=Path(args.destination).expanduser().resolve() if args.destination else Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex')))/'skills/before-public'
    if destination.exists():
        if not args.update or not (destination/'SKILL.md').is_file() or '\nname: before-public\n' not in (destination/'SKILL.md').read_text(encoding='utf-8'):
            raise SystemExit('Destination exists; use --update only for an existing before-public skill. No files overwritten.')
        with tempfile.TemporaryDirectory() as folder:
            staged=Path(folder)/'before-public';build(staged);shutil.copytree(staged,destination,dirs_exist_ok=True)
    else:destination.parent.mkdir(parents=True,exist_ok=True);build(destination)
    print('Skill installed. Use $before-public in a new Codex session. First use may set up its private Python environment and local rules.')

if __name__=='__main__':main()
