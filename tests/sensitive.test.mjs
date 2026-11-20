import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {detectSensitive} from '../docs/sensitive.js';
import {scanFiles} from '../docs/scanner.js';

test('automatic candidates and OCR spacing normalization do not expose values',async()=>{
  const text=['姓名：张三','11010519491231002X','13800138000','API_KEY: sk-proj-'+ 'Ab12Cd34'.repeat(4),'ghp_'+ 'A1b2C3'.repeat(6)].join('\n');
  const file=new File([text],'13800138000.txt');
  const report=await scanFiles([{path:file.name,file}],[]);
  for(const label of ['姓名','身份证','手机号','API','GitHub'])assert.ok(report.findings.some(f=>f.rule.includes(label)));
  for(const value of text.split('\n'))assert.ok(!JSON.stringify(report).includes(value));
  assert.match(report.findings[0].path,/含敏感/);
  assert.ok(detectSensitive('手机号：１３８ ００１３ ８０００',true).some(label=>label.includes('手机号')));
  assert.deepEqual(detectSensitive('张三在这里，没有姓名标签'),[]);
});

test('OCR warnings remain incomplete alongside useful matches',async()=>{
  const file=new File([await readFile(new URL('./fixtures/ocr/sensitive.png',import.meta.url))],'fixture.png');
  const report=await scanFiles([{path:file.name,file}],['张三'],{readDocument:async()=>({units:[{text:'姓名：张 三',location:'图片 OCR',ocr:true}],warnings:['OCR 置信度偏低，请人工核对。'],ocr:[{location:'图片 OCR',confidence:40}]})});
  assert.equal(report.counts.ocr,1);assert.equal(report.skipped.length,1);
  assert.ok(report.findings.some(f=>f.rule==='敏感词 1'));
  assert.ok(report.findings.some(f=>f.rule.includes('姓名')));
  assert.doesNotMatch(JSON.stringify(report),/张三|张 三/);
});
