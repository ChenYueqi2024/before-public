import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractDocument} from '../docs/documents.js';
import {scanFiles} from '../docs/scanner.js';
import {outcome} from '../docs/report.js';
import {zipSync,strToU8} from '../docs/vendor/documents/fflate.js';
const read=name=>readFile(new URL('./fixtures/documents/'+name,import.meta.url));
const check=async(name,bytes)=>scanFiles([{path:name,file:new File([bytes||await read(name)],name)}],['Private Person','private@example.invalid','虚构同学'],{readDocument:extractDocument});
for(const extension of ['doc','docx','pdf'])test(extension+' extracts and matches text including Chinese',async()=>{
  const result=await check('sample.'+extension);assert.equal(result.skipped.length,0);assert.equal(result.counts.document,1);
  for(const rule of ['敏感词 1','敏感词 2','敏感词 3'])assert.ok(result.findings.some(f=>f.rule===rule));
  assert.doesNotMatch(JSON.stringify(result),/Private Person|private@example.invalid|虚构同学/);
});
test('DOCX matches split runs, tables, headers and properties',async()=>{
  const result=await check('sample.docx');assert.equal(result.findings.length,5);assert.ok(result.findings.some(f=>f.location.includes('header')));assert.ok(result.findings.some(f=>f.location.includes('docProps')));
});
test('encrypted documents cannot pass',async()=>{for(const name of ['encrypted.doc','encrypted.pdf']){const result=await check(name);assert.equal(result.counts.document,0);assert.equal(result.skipped.length,1);assert.equal(outcome(result).kind,'error');}});
test('image-only and mixed PDFs remain incomplete even when metadata exists',async()=>{
  for(const name of ['scan.pdf','mixed.pdf']){const result=await check(name);assert.equal(result.counts.document,0);assert.ok(result.skipped.length>0);assert.notEqual(outcome(result).kind,'success');}
  assert.ok((await check('mixed.pdf')).findings.length>=3);
});
test('corrupt, missing-body and entity-bearing DOCX fail',async()=>{
  for(const bytes of [strToU8('bad'),zipSync({'other.xml':strToU8('<root/>')}),zipSync({'word/document.xml':strToU8('<!DOCTYPE x [<!ENTITY secret "private">]><x>&secret;</x>')})]){
    const result=await check('bad.docx',bytes);assert.equal(result.counts.document,0);assert.ok(result.skipped.length>0);
  }
});
test('clean documents show success, unsupported input never says no hits as a pass',async()=>{
  assert.equal(outcome(await check('clean.docx')).kind,'success');
  const failed=await check('unsupported.bin',new Uint8Array([1,2,3]));assert.equal(outcome(failed).kind,'error');assert.match(outcome(failed).title,/未能/);
});
test('empty Word body is incomplete even with readable metadata',async()=>{
  const bytes=zipSync({'word/document.xml':strToU8('<document><body/></document>'),'docProps/core.xml':strToU8('<properties><title>Public</title></properties>')});
  const result=await check('empty.docx',bytes);assert.equal(result.counts.document,0);assert.ok(result.skipped.length>0);
});
test('sensitive words in internal document part names are masked in reports',async()=>{
  const bytes=zipSync({'word/document.xml':strToU8('<document><p>Public</p></document>'),'docProps/Private Person.xml':strToU8('<properties><title>Private Person</title></properties>')});
  const result=await check('parts.docx',bytes);assert.equal(result.findings.length,1);assert.doesNotMatch(JSON.stringify(result),/Private Person/);
});
