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
from ocr_text import image_units,pdf_units
from sensitive import detect,normalize,redact_report

OCR_CHECKS=[]
original=scanner.inspect_bytes
def inspect(data,name,rules):
    suffix=Path(name).suffix.lower()
    def match(units,findings,custom=True):
        for text,location in units:
            ocr=location.endswith('OCR')
            for number,line in enumerate(text.splitlines(),1):
                expanded=normalize(html.unescape(line),ocr)
                if custom:
                    for term in rules['terms']:
                        value=term['value']
                        if value in line or value in expanded or (ocr and re.sub(r'[ \t]','',value) in re.sub(r'[ \t]','',expanded)):findings.append(dict(rule=term['label'],location=location,line=number))
                for label in detect(expanded,ocr):findings.append(dict(rule=label,location=location,line=number))
    def record(checks):
        OCR_CHECKS.extend(dict(item,path=scanner.redact(name,rules)) for item in checks)
    if suffix in {'.doc','.docx','.pdf'}:
        units,reasons=extract(data,suffix,with_ocr=True);findings=[]
        if suffix=='.pdf':
            found,notes,checks=pdf_units(data);units.extend(found);reasons.extend(notes);record(checks)
        match(units,findings)
        kind='skipped' if reasons else 'text'
    else:
        findings,reasons,kind=original(data,name,rules)
        if kind=='text':
            text=data.decode('utf-16' if data.startswith((b'\xff\xfe',b'\xfe\xff')) else 'utf-8-sig')
            match([(text,'text')],findings,custom=False)
        elif kind=='image':
            found,notes,checks=image_units(data);reasons.extend(notes);record(checks);match(found,findings)
    for label in detect(name):findings.append(dict(rule=label,location='path',line=None))
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
            OCR_CHECKS.clear()
            report=scanner.scan(root,rules,mode)
            if not rules['terms']:report['skipped'].append(dict(path='[rules]',reason='No personal terms configured; names and other personal strings were not checked.',commit=None))
            report['snapshot_fingerprint']=before
            report['ocr_checks']=list(OCR_CHECKS)
            report['document_scope']='中英文图片 OCR 与 PDF 前 20 页整页 OCR；自动检测姓名字段、身份证格式、中国大陆手机号、常见 API key / PAT 候选。未配置姓名不做通用实体识别；OCR 置信度不等于准确率，仍可能漏字。Word 内图片、宏、所有隐藏对象、DOC 属性和已删除修订不在范围内。'
            report=redact_report(report)
            write_report(report,output/mode)
            code=2 if report['skipped'] else 1 if report['findings'] else 0;status=max(status,code)
            summaries.append(dict(mode=mode,findings=len(report['findings']),incomplete=len(report['skipped']),counts=report['counts']))
        if fingerprint(root)!=before:status=2;print('Git refs/index changed while scanning. Results are stale; run again.')
        print(json.dumps(dict(exit_code=status,checks=summaries,report_directory=str(output)),ensure_ascii=True));return status
    except Exception:
        print('Check could not complete. Verify the repository, local rules, Git and dependencies. No privacy pass was issued.');return 2

if __name__=='__main__':raise SystemExit(main())
