// Minimal synthetic Word 97 CFB with a Unicode piece table; no author or machine data.
const CFB=require('cfb'),fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'../tests/fixtures/documents');fs.mkdirSync(dir,{recursive:true});
for(const [name,encrypted] of [['sample.doc',false],['encrypted.doc',true]]){
 const text='Synthetic fixture. Private Person. 虚构同学。\rprivate@example.invalid\r';
 const word=Buffer.alloc(4096),table=Buffer.alloc(4096),offset=1024;
 word.writeUInt16LE(0xa5ec,0);word.writeUInt16LE(0xc1,2);word.writeUInt16LE(0x0200|(encrypted?0x0100:0),10);
 word.writeUInt32LE(offset,0x18);word.writeUInt32LE(offset+text.length*2,0x1c);word.writeUInt32LE(text.length,0x4c);
 word.writeUInt32LE(0,0x1a2);word.writeUInt32LE(21,0x1a6);Buffer.from(text,'utf16le').copy(word,offset);
 table[0]=2;table.writeUInt32LE(16,1);table.writeUInt32LE(0,5);table.writeUInt32LE(text.length,9);table.writeUInt32LE(offset,15);
 const cfb=CFB.utils.cfb_new();CFB.utils.cfb_add(cfb,'WordDocument',word);CFB.utils.cfb_add(cfb,'1Table',table);
 fs.writeFileSync(path.join(dir,name),CFB.write(cfb,{type:'buffer'}));
}
console.log('Synthetic Word CFB fixtures generated.');
