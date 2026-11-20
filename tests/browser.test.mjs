import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {imageKind,inspectGPS} from '../docs/gps.js';
import {parseTerms,redact,scanFiles,LIMITS} from '../docs/scanner.js';
import {reportHTML} from '../docs/report.js';
const fixture=name=>readFile(new URL('./fixtures/'+name,import.meta.url));
const entry=(name,content)=>({path:name,file:new File([content],name)});

for(const extension of ['jpg','png','webp']){
  test(`${extension}: GPS and clean image`,async()=>{
    assert.equal(await inspectGPS(await fixture('gps.'+extension)),true);
    assert.equal(await inspectGPS(await fixture('clean.'+extension)),false);
    const result=await scanFiles([entry('gps.'+extension,await fixture('gps.'+extension)),entry('clean.'+extension,await fixture('clean.'+extension))],[]);
    assert.equal(result.counts.image,2);assert.equal(result.findings.length,1);assert.equal(result.skipped.length,2);
    assert.ok(result.skipped.every(item=>item.reason.includes('OCR 引擎不可用')));
    assert.equal(result.findings[0].rule,'EXIF GPS');assert.doesNotMatch(JSON.stringify(result),/latitude|longitude|GPSLatitude/i);
  });
  test(`${extension}: truncated containers are incomplete`,async()=>{
    const bytes=await fixture('gps.'+extension),result=await scanFiles([entry('broken.'+extension,bytes.subarray(0,bytes.length-10))],[]);
    assert.equal(result.counts.image,0);assert.equal(result.skipped.length,2);
  });
}
test('partial GPS metadata is detected even without coordinates',async()=>assert.equal(await inspectGPS(await fixture('partial-gps.jpg')),true));
test('invalid GPS pointer is incomplete, never clean',async()=>{
  const bytes=Buffer.from(await fixture('gps.jpg')),start=bytes.indexOf(Buffer.from('Exif\0\0'))+6;
  const little=bytes.toString('ascii',start,start+2)==='II',view=new DataView(bytes.buffer,bytes.byteOffset+start,bytes.length-start);
  const root=view.getUint32(4,little),count=view.getUint16(root,little);
  let changed=false;for(let i=0;i<count;i++){const offset=root+2+i*12;if(view.getUint16(offset,little)===34853){view.setUint32(offset+8,0xfffffff0,little);changed=true;}}
  assert.equal(changed,true);const result=await scanFiles([entry('broken.jpg',bytes)],[]);
  assert.equal(result.skipped.length,2);assert.equal(result.counts.image,0);
});
test('image extensions and bare headers cannot produce a clean result',async()=>{
  const result=await scanFiles([entry('bad.jpg',Buffer.from([255,216,255,217])),entry('bad.png','text'),entry('image.heic','unknown'),entry('image.tiff','unknown')],[]);
  assert.equal(result.skipped.length,5);assert.equal(result.counts.image,0);assert.equal(imageKind(new Uint8Array()),null);
});
test('literal terms, entities, line numbers and filename redaction',async()=>{
  const terms=parseTerms('Private Person\na+b\nPrivate Person\n\n');
  assert.deepEqual(terms,['Private Person','a+b']);
  const result=await scanFiles([entry('Private Person.html','<p>Private&#32;Person</p>\r\na+b\r\npublic')],terms);
  assert.equal(result.findings.length,3);assert.deepEqual(result.findings.map(x=>x.line),[null,1,2]);
  assert.equal(result.counts.text,1);assert.doesNotMatch(JSON.stringify(result),/Private Person|a\+b/);
  assert.equal(redact('abcde',['abc','cde','']), '[已遮盖]');
});
test('UTF-8 and BOM UTF-16 LE/BE are supported, invalid encoding is incomplete',async()=>{
  const le=Buffer.from('\ufeffPrivate','utf16le'),be=Buffer.from(le).swap16();
  const result=await scanFiles([entry('utf8.md','Private'),entry('le.txt',le),entry('be.txt',be),entry('invalid.txt',Buffer.from([0xff,0x80]))],['Private']);
  assert.equal(result.counts.text,3);assert.equal(result.findings.length,3);assert.equal(result.skipped.length,1);
});
test('binary, PDF, Office and archives are not silently counted as text',async()=>{
  const result=await scanFiles([entry('doc.pdf','%PDF'),entry('fake.txt','%PDF-sample'),entry('binary.txt',Buffer.from([0,1])),entry('slides.pptx','PK\x03\x04'),entry('fake.md','PK\x03\x04')],['private']);
  assert.equal(result.skipped.length,5);assert.equal(result.counts.text,0);
});
test('automatic checks work without custom terms; matching filenames still reported for unsupported files',async()=>{
  assert.equal((await scanFiles([entry('page.txt','private')],[])).skipped.length,0);
  const result=await scanFiles([entry('private.pdf','%PDF')],['private']);
  assert.equal(result.findings.length,1);assert.equal(result.skipped.length,1);assert.doesNotMatch(JSON.stringify(result),/private/);
});
test('file and aggregate limits never read content',async()=>{
  let reads=0;const file={name:'large.txt',size:LIMITS.file+1,arrayBuffer(){reads++;throw Error();}};
  assert.equal((await scanFiles([{path:'large.txt',file}],['x'])).skipped.length,1);
  assert.equal((await scanFiles(Array.from({length:301},()=>entry('small.txt','')),['x'])).skipped.length,1);
  assert.equal((await scanFiles(Array.from({length:9},()=>({path:'large.txt',file})),['x'])).skipped.length,1);
  assert.equal(reads,0);assert.throws(()=>parseTerms('a'.repeat(201)));assert.throws(()=>parseTerms(Array.from({length:51},(_,i)=>'word'+i).join('\n')));
});
test('finding cap reports incomplete coverage and remains bounded',async()=>{
  const result=await scanFiles([entry('large.txt','private\n'.repeat(6000)),entry('later.txt','private')],['private']);
  assert.equal(result.findings.length,5000);assert.equal(result.skipped.length,2);assert.equal(result.counts.text,0);
});
test('read failures and cancellation do not appear as completed checks',async()=>{
  const result=await scanFiles([{path:'private.txt',file:{name:'private.txt',size:1,arrayBuffer(){throw Error('private content');}}}],['private']);
  assert.equal(result.skipped.length,1);assert.doesNotMatch(JSON.stringify(result),/private/);
  const controller=new AbortController();controller.abort();await assert.rejects(scanFiles([entry('file.txt','x')],['x'],{signal:controller.signal}),{name:'AbortError'});
  const during=new AbortController();await assert.rejects(scanFiles([entry('one.txt','x'),entry('two.txt','x')],['x'],{signal:during.signal,progress:()=>during.abort()}),{name:'AbortError'});
});
test('HTML export escapes untrusted filenames and contains no matched content',async()=>{
  const result=await scanFiles([entry('<img src=x onerror=alert(1)>private.txt','private')],['private']);
  const html=reportHTML(result);assert.doesNotMatch(html,/<img|private/);assert.match(html,/&lt;img/);assert.match(html,/default-src 'none'/);
});
