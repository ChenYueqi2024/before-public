import html
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from before_public.scanner import MAX_BYTES, load_rules, scan
from before_public.report import render_html
from before_public.__main__ import main


class ScannerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)/'site';self.root.mkdir()
        self.rules=dict(terms=[dict(label='Private name',value='Sample Private Person')],forbidden_paths=['assets/old-photo.jpg'])
        self.config=Path(self.tmp.name)/'rules.json';self.config.write_text(json.dumps(self.rules),encoding='utf-8')
    def tearDown(self):self.tmp.cleanup()
    def git(self,*args):
        return subprocess.run(['git','-C',str(self.root),*args],check=True,capture_output=True).stdout
    def init_git(self):
        if not shutil.which('git'):self.skipTest('Git not installed')
        self.git('init');self.git('config','user.name','Fixture');self.git('config','user.email','fixture@example.invalid')
        self.git('config','core.autocrlf','false')
    def test_text_meta_entity_filename_and_redaction(self):
        name='Sample Private Person.html'
        (self.root/name).write_text('<meta name="author" content="Sample Private Person">\nSample&#32;Private&#32;Person',encoding='utf-8')
        report=scan(self.root,self.rules)
        self.assertEqual(len(report['findings']),3)
        self.assertEqual({f['line'] for f in report['findings']},{None,1,2})
        self.assertNotIn('Sample Private Person',json.dumps(report));self.assertNotIn('Sample Private Person',render_html(report))
        self.assertIn('[redacted].html',render_html(report))
    def test_utf16_and_binary_coverage(self):
        (self.root/'utf16.txt').write_text('Sample Private Person',encoding='utf-16')
        (self.root/'archive.bin').write_bytes(b'\0\xff\x00\x80')
        report=scan(self.root,self.rules)
        self.assertEqual(len(report['findings']),1);self.assertEqual(len(report['skipped']),1)
    def test_exif_gps_and_plain_image(self):
        exif=Image.Exif();exif[34853]={1:'N',2:(IFDRational(1),IFDRational(2),IFDRational(3)),3:'E',4:(IFDRational(4),IFDRational(5),IFDRational(6))}
        Image.new('RGB',(10,10),'purple').save(self.root/'gps.jpg',exif=exif)
        Image.new('RGB',(10,10),'blue').save(self.root/'plain.png')
        report=scan(self.root,self.rules)
        self.assertEqual(report['counts']['image'],2)
        self.assertEqual([f['rule'] for f in report['findings']],['EXIF GPS'])
        self.assertEqual(report['skipped'],[])
    def test_config_and_output_excluded_only_in_directory_mode(self):
        config=self.root/'privacy.local.json';config.write_text(json.dumps(self.rules),encoding='utf-8')
        output=self.root/'report';output.mkdir();(output/'private.txt').write_text('Sample Private Person')
        report=scan(self.root,self.rules,config_path=config,output_path=output)
        self.assertEqual(report['counts']['entries'],0);self.assertEqual(report['excluded_directories'],['report'])
        self.init_git();self.git('add','privacy.local.json')
        self.assertTrue(scan(self.root,self.rules,'staged',config_path=config)['findings'])
    def test_staged_reads_index_not_worktree(self):
        self.init_git();file=self.root/'index.html';file.write_text('Sample Private Person')
        self.git('add','index.html');file.write_text('Yueqi')
        self.assertEqual(scan(self.root,self.rules)['findings'],[])
        staged=scan(self.root,self.rules,'staged');self.assertEqual(len(staged['findings']),1)
        self.assertEqual(staged['findings'][0]['line'],1)
    def test_history_detects_deleted_file_and_other_branch(self):
        self.init_git();(self.root/'assets').mkdir()
        Image.new('RGB',(8,8)).save(self.root/'assets/old-photo.jpg')
        (self.root/'index.html').write_text('Sample Private Person')
        self.git('add','.');self.git('commit','-m','Synthetic private state')
        old=self.git('rev-parse','HEAD').decode().strip()
        self.git('rm','assets/old-photo.jpg');(self.root/'index.html').write_text('Yueqi')
        self.git('add','.');self.git('commit','-m','Remove synthetic private data')
        self.assertEqual(scan(self.root,self.rules)['findings'],[])
        report=scan(self.root,self.rules,'history')
        self.assertTrue(any(f['rule']=='Forbidden path' and f['commit']==old for f in report['findings']))
        self.assertTrue(any(f['rule']=='Private name' for f in report['findings']))
        self.git('checkout','-b','side');(self.root/'side.txt').write_text('Sample Private Person')
        self.git('add','.');self.git('commit','-m','Synthetic side branch');self.git('checkout','--detach','HEAD~1')
        report=scan(self.root,self.rules,'history')
        self.assertTrue(any(f['path']=='side.txt' for f in report['findings']))
    def test_git_filenames_with_spaces_and_unicode(self):
        self.init_git();name='合成 文件.txt';(self.root/name).write_text('Sample Private Person')
        self.git('add','.');report=scan(self.root,self.rules,'staged')
        self.assertEqual(report['findings'][0]['path'],name)
        if os.name!='nt':
            name='tab\tnewline\n.txt';(self.root/name).write_text('Sample Private Person');self.git('add','.')
            self.assertTrue(any(f['path']==name for f in scan(self.root,self.rules,'staged')['findings']))
    def test_file_limit_and_symlink_are_not_clean(self):
        with (self.root/'large.txt').open('wb') as file:file.truncate(MAX_BYTES+1)
        report=scan(self.root,self.rules);self.assertEqual(len(report['skipped']),1)
        outside=Path(self.tmp.name)/'outside.txt';outside.write_text('Sample Private Person')
        try:(self.root/'link.txt').symlink_to(outside)
        except OSError:return  # Windows without symlink privileges; Linux CI exercises this.
        report=scan(self.root,self.rules)
        self.assertEqual(len(report['skipped']),2);self.assertEqual(report['findings'],[])
    def test_html_escapes_rule_labels(self):
        self.rules['terms'][0]['label']='<script>alert(1)</script>'
        (self.root/'index.txt').write_text('Sample Private Person')
        report=render_html(scan(self.root,self.rules))
        self.assertNotIn('<script>',report);self.assertIn('&lt;script&gt;',report)
    def test_invalid_rules_and_cli_exit_codes(self):
        for data in [None,{},dict(terms=['bad']),dict(terms=[dict(label='x',value='')]),dict(forbidden_paths=['../photo.jpg'])]:
            self.config.write_text(json.dumps(data),encoding='utf-8')
            with self.assertRaises(ValueError):load_rules(self.config)
        self.config.write_text(json.dumps(self.rules),encoding='utf-8')
        out=Path(self.tmp.name)/'output';args=[str(self.root),'--config',str(self.config),'--output',str(out)]
        (self.root/'page.html').write_text('Yueqi');self.assertEqual(main(args),0)
        (self.root/'page.html').write_text('Sample Private Person');self.assertEqual(main(args),1)
        (self.root/'data.bin').write_bytes(b'\xff\0');self.assertEqual(main(args),2)
        self.assertTrue((out/'report.html').exists())
    def test_not_a_repository_is_incomplete(self):
        report=scan(self.root,self.rules,'history');self.assertTrue(report['skipped'])


if __name__=='__main__':unittest.main()
