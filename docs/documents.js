import libraries from './vendor/documents/word-xml.js';
import {unzipSync} from './vendor/documents/fflate.js';
import {getDocument} from './vendor/documents/pdf.js';
import {WorkerMessageHandler} from './vendor/documents/pdf.worker.js';
import {assets} from './vendor/documents/pdf-assets.js';

globalThis.pdfjsWorker={WorkerMessageHandler};
const MAX_TEXT=4*1024*1024;
const fail=message=>{throw new Error(message);};
class LocalPDFData {
  async fetch({kind,filename}){
    const data=assets[kind]?.[filename];if(!data)fail('所需 PDF 字体或字符映射不可用。');
    return Uint8Array.from(atob(data),character=>character.charCodeAt(0));
  }
}
export async function extractDocument(bytes,extension){
  const units=[],warnings=[];let size=0;
  function add(text,location){if(!text?.trim())return;size+=text.length;if(size>MAX_TEXT)fail('文档提取文本超过 4 MiB，请拆分文档后重试。');units.push({text,location});}
  if(extension==='docx'){
    let entries=0,total=0;
    const files=unzipSync(bytes,{filter:file=>{
      if(++entries>2000||(total+=file.originalSize)>32*1024*1024)fail('DOCX 解压内容超过 32 MiB 或 2000 项，请缩小文档后重试。');
      if(/^word\/(embeddings|afchunk|altChunk)/i.test(file.name))warnings.push('文档含内嵌对象或外部格式内容，这部分未检查；请单独导出检查。');
      return /^word\/(document|header\d*|footer\d*|comments|footnotes|endnotes)\.xml$/.test(file.name)||/^docProps\/[^/]+\.xml$/.test(file.name);
    }});
    if(!files['word/document.xml'])fail('不是可读取的 DOCX 文档，可能已加密或文件扩展名不正确。');
    for(const [part,data] of Object.entries(files)){
      const xml=new TextDecoder('utf-8',{fatal:true}).decode(data);
      const text=libraries.xmlText(xml);
      if(part==='word/document.xml'&&!text.trim())warnings.push('DOCX 正文没有可提取文字，可能只有图片或为空；请人工核对或先 OCR。');
      add(text,'DOCX '+part);
    }
  }else if(extension==='doc'){
    if(![208,207,17,224,161,177,26,225].every((value,i)=>bytes[i]===value))fail('无法识别旧版 Word DOC。若实际是 RTF、HTML 或其他格式，请用 Word 另存为 DOCX。');
    const doc=await libraries.extractDoc(bytes);
    for(const [method,label] of [['getBody','正文'],['getHeaders','页眉'],['getFooters','页脚'],['getFootnotes','脚注'],['getEndnotes','尾注'],['getAnnotations','批注'],['getTextboxes','文本框']])add(doc[method]({filterUnicode:false,includeFooters:false}),'DOC '+label);
  }else if(extension==='pdf'){
    const task=getDocument({data:bytes.slice(),isEvalSupported:false,useWasm:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,BinaryDataFactory:LocalPDFData,stopAtErrors:true,verbosity:0});
    try{
      const pdf=await task.promise;if(pdf.numPages>100)fail('PDF 超过 100 页，请拆分后检查。');
      for(let number=1;number<=pdf.numPages;number++){
        const page=await pdf.getPage(number),content=await page.getTextContent();
        const text=content.items.map(item=>(item.str||'')+(item.hasEOL?'\n':'')).join('');
        if(!text.trim())warnings.push(`PDF 第 ${number} 页没有可提取文字，可能是扫描页或空白页；请人工核对或先 OCR。`);
        else if(text.includes('\uFFFD'))warnings.push(`PDF 第 ${number} 页含无法解码的字符，文字检查可能不完整。`);
        add(text,`PDF 第 ${number} 页`);
        for(const annotation of await page.getAnnotations())add([annotation.contentsObj?.str,annotation.fieldValue,annotation.titleObj?.str].flat().filter(x=>typeof x==='string').join('\n'),`PDF 第 ${number} 页批注 / 表单`);
        page.cleanup();
      }
      const metadata=await pdf.getMetadata();add(JSON.stringify(metadata.info),'PDF 文档属性');
      if(metadata.metadata)add(JSON.stringify(metadata.metadata.getAll()),'PDF 元数据');
      if(await pdf.getAttachments())warnings.push('PDF 含附件；附件内容未检查，请单独导出检查。');
    }finally{await task.destroy();}
  }else fail('不支持的文档格式。');
  if(!units.length)warnings.push('未提取到可检查的文字，不能据此判断没有敏感词；请确认文档内容或先 OCR。');
  return {units,warnings:[...new Set(warnings)]};
}
