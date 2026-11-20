import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class SkillTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.base=Path(self.temp.name);self.repo=self.base/'repo';self.repo.mkdir()
        self.skill=self.base/'skill'
        subprocess.run([sys.executable,str(ROOT/'scripts/install_skill.py'),'--destination',str(self.skill)],check=True,capture_output=True)
        self.git('init');self.git('config','user.name','Synthetic Fixture');self.git('config','user.email','fixture@example.invalid')
        self.rules=self.base/'rules.json';self.rules.write_text(json.dumps({'terms':[{'label':'Name','value':'Private Person'},{'label':'CJK','value':'虚构同学'}]}),encoding='utf-8')
    def tearDown(self):self.temp.cleanup()
    def git(self,*args):return subprocess.run(['git','-C',str(self.repo),*args],check=True,capture_output=True).stdout
    def check(self,*args):
        env=dict(os.environ,NODE_PATH=str(ROOT/'node_modules'))
        return subprocess.run([sys.executable,str(self.skill/'scripts/check.py'),str(self.repo),'--config',str(self.rules),'--output',str(self.base/'reports'),*args],capture_output=True,text=True,encoding='utf-8',env=env)
    def test_staged_reads_blobs_and_history_finds_deleted_documents(self):
        for suffix in ['doc','docx','pdf']:shutil.copyfile(ROOT/f'tests/fixtures/documents/sample.{suffix}',self.repo/f'sample.{suffix}')
        self.git('add','.');self.git('commit','-m','Synthetic documents')
        self.git('rm','sample.doc','sample.docx','sample.pdf');self.git('commit','-m','Remove documents')
        (self.repo/'current.txt').write_text('Private Person',encoding='utf-8');self.git('add','current.txt');(self.repo/'current.txt').write_text('Public',encoding='utf-8')
        before=self.git('status','--porcelain=v1','-z');result=self.check();self.assertEqual(result.returncode,1,result.stdout+result.stderr)
        self.assertEqual(before,self.git('status','--porcelain=v1','-z'))
        for mode in ['staged','history']:
            report=json.loads((self.base/f'reports/{mode}/report.json').read_text(encoding='utf-8'))
            self.assertTrue(report['findings']);self.assertFalse(report['skipped']);self.assertNotIn('Private Person',json.dumps(report));self.assertNotIn('虚构同学',json.dumps(report,ensure_ascii=False))
        self.assertEqual(len({f['path'] for f in report['findings']}),3)
    def test_first_commit_clean_and_builtin_credentials(self):
        (self.repo/'ok.txt').write_text('Public');self.git('add','.');self.assertEqual(self.check('--mode','staged').returncode,0)
        (self.repo/'key.txt').write_text('-----BEGIN PRIVATE KEY-----');self.git('add','.');result=self.check('--mode','staged');self.assertEqual(result.returncode,1)
    def test_ocr_finds_deleted_images_and_scanned_or_mixed_pdf(self):
        for name in ['sensitive.png','scanned.pdf','mixed.pdf']:shutil.copyfile(ROOT/'tests/fixtures/ocr'/name,self.repo/name)
        self.git('add','.');self.git('commit','-m','Synthetic OCR fixtures')
        self.git('rm','sensitive.png','scanned.pdf','mixed.pdf');self.git('commit','-m','Remove fixtures')
        result=self.check();self.assertEqual(result.returncode,1,result.stdout+result.stderr)
        report=json.loads((self.base/'reports/history/report.json').read_text(encoding='utf-8'))
        self.assertFalse(report['skipped']);self.assertEqual(len(report['ocr_checks']),3)
        for name in ['sensitive.png','scanned.pdf','mixed.pdf']:
            labels={hit['rule'] for hit in report['findings'] if hit['path']==name}
            for category in ['姓名','身份证','手机号','API','GitHub']:self.assertTrue(any(category in label for label in labels),category)
        for value in ['张三','13800138000','11010519491231002X','sk-proj-Ab12','ghp_A1b2']:self.assertNotIn(value,json.dumps(report,ensure_ascii=False))
    def test_blank_image_requires_review(self):
        shutil.copyfile(ROOT/'tests/fixtures/ocr/blank.png',self.repo/'blank.png');self.git('add','.')
        self.assertEqual(self.check('--mode','staged').returncode,2)
    def test_unsupported_and_encrypted_are_incomplete(self):
        shutil.copyfile(ROOT/'tests/fixtures/documents/encrypted.pdf',self.repo/'encrypted.pdf');self.git('add','.');self.assertEqual(self.check('--mode','staged').returncode,2)
    def test_rules_and_reports_inside_repo_rejected(self):
        (self.repo/'ok.txt').write_text('Public');self.git('add','.')
        shutil.copyfile(self.rules,self.repo/'rules.json');self.rules=self.repo/'rules.json';self.assertEqual(self.check('--mode','staged').returncode,2)
        self.rules=self.base/'rules.json';self.assertEqual(self.check('--mode','staged','--output',str(self.repo/'reports')).returncode,2)
    def test_missing_rules_or_placeholder_not_treated_as_pass(self):
        self.rules.unlink();self.assertEqual(self.check().returncode,2)
        shutil.copyfile(self.skill/'scripts/rules.example.json',self.rules);self.assertEqual(self.check().returncode,2)

if __name__=='__main__':unittest.main()
