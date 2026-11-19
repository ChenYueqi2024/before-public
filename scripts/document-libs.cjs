const OleExtractor=require('word-extractor/lib/word-ole-extractor');
const CFB=require('cfb');
const {SaxesParser}=require('saxes');
class CheckedExtractor extends OleExtractor {
  documentStream(document,name){const entry=CFB.find(document,name);if(!entry)throw Error('missing stream');return Promise.resolve(Buffer.from(entry.content));}
  streamBuffer(buffer){return Promise.resolve(buffer);}
  extractWordDocument(document,buffer){
    if(buffer.length<0x6c)throw Error('invalid');
    if(buffer.readUInt16LE(10)&0x8100)throw Error('encrypted');
    return super.extractWordDocument(document,buffer);
  }
}
module.exports={
  async extractDoc(bytes){const document=CFB.read(Buffer.from(bytes),{type:'buffer'}),extractor=new CheckedExtractor();return extractor.extractWordDocument(document,await extractor.documentStream(document,'WordDocument'));},
  xmlText(xml){
    const parser=new SaxesParser({xmlns:true});let text='';const stack=[];
    parser.on('doctype',()=>{throw Error('doctype');});
    parser.on('opentag',tag=>stack.push(tag.local));
    parser.on('text',value=>{if(value.trim()||['t','delText','instrText'].includes(stack.at(-1)))text+=value;});
    parser.on('cdata',value=>{text+=value;});
    parser.on('closetag',tag=>{stack.pop();if(['p','tr','br','tab'].includes(tag.local))text+='\n';});
    parser.on('error',()=>{throw Error('xml');});
    parser.write(xml).close();return text;
  }
};
