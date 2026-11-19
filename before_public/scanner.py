import html
import io
import json
import os
import subprocess
import warnings
from pathlib import Path, PurePosixPath

from PIL import Image, UnidentifiedImageError

MAX_BYTES = 16 * 1024 * 1024
IGNORED_DIRS = {'.git', '.venv', 'venv', 'node_modules', '__pycache__'}
IMAGE_SUFFIXES = {'.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'}


def load_rules(path):
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    except (OSError, ValueError, UnicodeError):
        raise ValueError('Rules must be readable UTF-8 JSON.') from None
    if not isinstance(data, dict) or not isinstance(data.get('terms', []), list) or not isinstance(data.get('forbidden_paths', []), list):
        raise ValueError('Rules need terms and/or forbidden_paths arrays.')
    terms, forbidden = data.get('terms', []), data.get('forbidden_paths', [])
    for term in terms:
        if (not isinstance(term, dict) or not isinstance(term.get('label'), str) or not term['label'].strip()
                or not isinstance(term.get('value'), str) or not term['value']):
            raise ValueError('Each term needs nonempty label and value strings.')
    for name in forbidden:
        if (not isinstance(name, str) or not name or '\\' in name or ':' in name
                or PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts):
            raise ValueError('Forbidden paths must be relative slash-separated paths without .. .')
    if not terms and not forbidden:
        raise ValueError('Configure at least one term or forbidden path.')
    return dict(terms=terms, forbidden_paths=forbidden)


def redact(text, rules):
    for term in sorted(rules['terms'], key=lambda t: len(t['value']), reverse=True):
        text = text.replace(term['value'], '[redacted]')
    return text


def inspect_bytes(data, name, rules):
    """Return findings without source snippets or sensitive values."""
    findings, reasons = [], []
    is_image = False
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                is_image = True
                exif = image.getexif()
                if 34853 in exif and exif.get_ifd(34853):
                    findings.append(dict(rule='EXIF GPS', location='image metadata', line=None))
    except UnidentifiedImageError:
        if Path(name).suffix.lower() in IMAGE_SUFFIXES:
            return findings, ['Image metadata could not be read.'], 'skipped'
    except (OSError, ValueError, SyntaxError, TypeError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        return findings, ['Image metadata could not be fully inspected.'], 'skipped'
    if is_image:
        # GPS detection is supported; pixel text, faces and non-GPS metadata are not.
        return findings, reasons, 'image'
    try:
        encoding = 'utf-16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig'
        text = data.decode(encoding)
        if '\0' in text:
            raise UnicodeError()
    except UnicodeError:
        return findings, ['Unsupported binary or text encoding; content not inspected.'], 'skipped'
    for number, line in enumerate(text.splitlines(), 1):
        # Decode HTML entities as well as literal text: names can live in meta tags.
        expanded = html.unescape(line)
        for term in rules['terms']:
            if term['value'] in line or term['value'] in expanded:
                findings.append(dict(rule=term['label'], location='text', line=number))
    return findings, reasons, 'text'


def git(root, *args):
    return subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True).stdout


def scan(target, rules, mode='directory', config_path=None, output_path=None):
    root = Path(target).resolve()
    if mode not in ('directory', 'staged', 'history'):
        raise ValueError('Unknown scan mode.')
    if not root.is_dir():
        raise ValueError('Target must be an existing directory.')
    report = dict(schema_version=1, mode=mode, findings=[], skipped=[],
                  counts=dict(entries=0, text=0, image=0, commits=0), excluded_directories=[])

    def skip(name, reason, commit=None):
        report['skipped'].append(dict(path=name, reason=reason, commit=commit))

    def record(name, data=None, commit=None, cached=None):
        report['counts']['entries'] += 1
        for term in rules['terms']:
            if term['value'] in name:
                report['findings'].append(dict(path=name, rule=term['label'], location='path', line=None, commit=commit))
        if name in rules['forbidden_paths']:
            report['findings'].append(dict(path=name, rule='Forbidden path', location='path', line=None, commit=commit))
        if data is None and cached is None:
            return
        findings, reasons, kind = cached if cached is not None else inspect_bytes(data, name, rules)
        if kind in ('text', 'image'):
            report['counts'][kind] += 1
        for finding in findings:
            report['findings'].append(dict(finding, path=name, commit=commit))
        for reason in reasons:
            skip(name, reason, commit)

    if mode == 'directory':
        config_path = Path(config_path).resolve() if config_path else None
        output_path = Path(output_path).resolve() if output_path else None
        for folder, dirs, files in os.walk(root, followlinks=False,
                onerror=lambda e: skip('[directory]', 'Directory could not be read.')):
            folder = Path(folder)
            keep = []
            for name in dirs:
                path = folder/name
                relative = path.relative_to(root).as_posix()
                if path.is_symlink() or not path.resolve().is_relative_to(root):
                    skip(relative, 'Linked directory not followed.')
                elif name in IGNORED_DIRS or path.resolve() == output_path:
                    report['excluded_directories'].append(relative)
                else:
                    keep.append(name)
            dirs[:] = keep
            for name in files:
                path = folder/name
                relative = path.relative_to(root).as_posix()
                if path.resolve() == config_path:
                    continue
                record(relative)
                if path.is_symlink() or not path.resolve().is_relative_to(root):
                    skip(relative, 'Linked file not read.');continue
                try:
                    if path.stat().st_size > MAX_BYTES:
                        skip(relative, 'File exceeds 16 MiB inspection limit.');continue
                    findings, reasons, kind = inspect_bytes(path.read_bytes(), relative, rules)
                    if kind in ('text', 'image'):
                        report['counts'][kind] += 1
                    for finding in findings:
                        report['findings'].append(dict(finding, path=relative, commit=None))
                    for reason in reasons:
                        skip(relative, reason)
                except OSError:
                    skip(relative, 'File could not be read.')
    else:
        try:
            git_root = Path(os.fsdecode(git(root, 'rev-parse', '--show-toplevel').strip())).resolve()
            if root != git_root:
                raise ValueError('Git modes require the repository root as target.')
            if mode == 'staged':
                snapshots = [(None, git(root, 'ls-files', '--stage', '-z'))]
            else:
                commits = git(root, 'rev-list', '--all').decode('ascii').splitlines()
                report['counts']['commits'] = len(commits)
                snapshots = ((commit, git(root, 'ls-tree', '-r', '-z', commit)) for commit in commits)
            seen, cache = set(), {}
            for commit, raw in snapshots:
                for entry in raw.split(b'\0'):
                    if not entry:
                        continue
                    header, name_bytes = entry.split(b'\t', 1)
                    name = name_bytes.decode('utf-8', errors='replace')
                    parts = header.decode('ascii').split()
                    file_mode, oid = parts[:2] if mode == 'staged' else (parts[0], parts[2])
                    if (oid, name) in seen:
                        continue
                    seen.add((oid, name))
                    if file_mode not in ('100644', '100755') or (mode == 'staged' and parts[2] != '0'):
                        record(name, commit=commit)
                        skip(name, 'Symlink, submodule, or unmerged index entry not inspected.', commit);continue
                    # Include suffix because an undecodable .jpg must be reported as an image failure.
                    key = (oid, Path(name).suffix.lower())
                    if key not in cache:
                        if int(git(root, 'cat-file', '-s', oid)) > MAX_BYTES:
                            cache[key] = ([], ['Blob exceeds 16 MiB inspection limit.'], 'skipped')
                        else:
                            cache[key] = inspect_bytes(git(root, 'cat-file', 'blob', oid), name, rules)
                    record(name, commit=commit, cached=cache[key])
        except (OSError, subprocess.CalledProcessError):
            # Do not echo Git stderr: it can contain private filenames or repository URLs.
            skip('[git]', 'Git is unavailable or a repository object could not be read; scan incomplete.')
    # Also mask sensitive terms in paths and user-supplied rule labels, not only snippets.
    def masked(value):
        if isinstance(value, str):return redact(value, rules)
        if isinstance(value, list):return [masked(v) for v in value]
        if isinstance(value, dict):return {k:masked(v) for k,v in value.items()}
        return value
    return masked(report)
