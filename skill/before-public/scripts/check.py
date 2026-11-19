"""Read-only pre-push checks. No network, credential output, hooks or Git writes."""
import argparse
import hashlib
import html
import json
import re
import sys
import tempfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'runtime' if (HERE/'runtime/before_public').is_dir() else HERE.parents[2]))
from before_public import scanner
from before_public.report import write_report
from document_text import extract

PATTERNS=[('Private key',re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----')),
          ('GitHub credential',re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b')),
          ('AWS access key candidate',re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'))]
original=scanner.inspect_bytes
def inspect(data,name,rules):
    suffix=Path(name).suffix.lower()
    if suffix in {'.doc','.docx','.pdf'}:
        units,reasons=extract(data,suffix);findings=[]
        for text,location in units:
            for number,line in enumerate(text.splitlines(),1):
                for term in rules['terms']:
                    if term['value'] in line or term['value'] in html.unescape(line):findings.append(dict(rule=term['label'],location=location,line=number))
                for label,pattern in PATTERNS:
                    if pattern.search(line):findings.append(dict(rule=label,location=location,line=number))
        kind='skipped' if reasons else 'text'
    else:
        findings,reasons,kind=original(data,name,rules)
        if kind=='text':
            text=data.decode('utf-16' if data.startswith((b'\xff\xfe',b'\xfe\xff')) else 'utf-8-sig')
            for number,line in enumerate(text.splitlines(),1):
                for label,pattern in PATTERNS:
                    if pattern.search(line):findings.append(dict(rule=label,location='text',line=number))
    if Path(name).name in {'.env','id_rsa','id_ed25519'}:findings.append(dict(rule='Potential credential file',location='path',line=None))
    return findings,reasons,kind
scanner.inspect_bytes=inspect

def fingerprint(root):
    return hashlib.sha256(b'\0'.join(scanner.git(root,*args) for args in [('for-each-ref','--format=%(refname) %(objectname)'),('ls-files','--stage','-z')])).hexdigest()

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('target');parser.add_argument('--config',default=str(Path.home()/'.config/before-public/rules.json'));parser.add_argument('--output');parser.add_argument('--mode',choices=['both','staged','history'],default='both');args=parser.parse_args(argv)
    root=Path(args.target).resolve();config=Path(args.config).resolve()
    if config.is_relative_to(root):print('Rules must be outside the repository.');return 2
    try:
        rules=scanner.load_rules(config)
        if any(t['value']=='REPLACE_THIS_WITH_A_PRIVATE_TERM' for t in rules['terms']):print('Replace the example rule locally before scanning.');return 2
        output=Path(args.output).resolve() if args.output else Path(tempfile.mkdtemp(prefix='before-public-'))
        if output.is_relative_to(root) or root.is_relative_to(output):print('Reports must be outside the repository.');return 2
        before=fingerprint(root);status=0;summaries=[]
        for mode in (['staged','history'] if args.mode=='both' else [args.mode]):
            report=scanner.scan(root,rules,mode)
            if not rules['terms']:report['skipped'].append(dict(path='[rules]',reason='No personal terms configured; names and other personal strings were not checked.',commit=None))
            report['snapshot_fingerprint']=before
            report['document_scope']='Extractable Word/PDF text only; no OCR, embedded-image GPS, macros, all hidden objects, DOC properties or deleted DOC revisions.'
            write_report(report,output/mode)
            code=2 if report['skipped'] else 1 if report['findings'] else 0;status=max(status,code)
            summaries.append(dict(mode=mode,findings=len(report['findings']),incomplete=len(report['skipped']),counts=report['counts']))
        if fingerprint(root)!=before:status=2;print('Git refs/index changed while scanning. Results are stale; run again.')
        print(json.dumps(dict(exit_code=status,checks=summaries,report_directory=str(output)),ensure_ascii=True));return status
    except Exception:
        print('Check could not complete. Verify the repository, local rules, Git and dependencies. No privacy pass was issued.');return 2

if __name__=='__main__':raise SystemExit(main())
