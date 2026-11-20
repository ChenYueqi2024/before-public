import {imageKind,inspectGPS} from './gps.js';
import {detectSensitive,normalizedText} from './sensitive.js';

export const LIMITS={files:300,total:128*1024*1024,file:16*1024*1024,terms:50,termLength:200,findings:5000};
const textExtensions=new Set(['txt','md','html','htm','css','js','mjs','cjs','jsx','ts','tsx','json','yaml','yml','xml','svg','csv','tsv','log','ini','toml','cfg','py','sh','gitignore','gitattributes','']);
const imageExtensions=/\.(jpe?g|png|webp|tiff?|heic|heif|avif|gif|bmp)$/i;

export function parseTerms(value) {
  const terms=[...new Set(value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean))];
  if(terms.length>LIMITS.terms||terms.some(term=>term.length>LIMITS.termLength))throw new Error('最多填写 50 个敏感词，每个不超过 200 个字符。');
  return terms;
}

// Redact the union of all matches, including overlaps, without reprocessing markers.
export function redact(value,terms) {
  const spans=[];
  for(const term of terms){if(!term)continue;let offset=value.indexOf(term);while(offset!==-1){spans.push([offset,offset+term.length]);offset=value.indexOf(term,offset+1);}}
  spans.sort((a,b)=>a[0]-b[0]);const merged=[];
  for(const span of spans){const last=merged.at(-1);if(last&&span[0]<=last[1])last[1]=Math.max(last[1],span[1]);else merged.push([...span]);}
  let output='',start=0;for(const [a,b] of merged){output+=value.slice(start,a)+'[已遮盖]';start=b;}return output+value.slice(start);
}

export function numericEntities(text) {
  return text.replace(/&#(x[0-9a-f]+|[0-9]+);?/gi,(_,digits)=>{const n=digits[0].toLowerCase()==='x'?parseInt(digits.slice(1),16):parseInt(digits,10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'\uFFFD';});
}

export async function scanFiles(entries,terms,{signal,decodeEntities=numericEntities,progress=()=>{},readDocument}={}) {
  const report={schema_version:3,mode:'browser-files',counts:{entries:entries.length,text:0,image:0,document:0,partial_document:0,ocr:0,commits:0},findings:[],skipped:[],ocr_checks:[],
    coverage:{terms:terms.length,automatic:'姓名字段、身份证格式、中国大陆手机号、常见 API key / PAT 候选；未知姓名不做通用实体识别，号码不联网验证',scope:'仅所选文件；不包含 Git 历史或暂存区',images:'JPEG / PNG / WebP 的 EXIF GPS 和中英文 OCR；不识别人脸或其他元数据',documents:'Word 可提取文字；PDF 文字层及前 20 页整页 OCR；不检查 Word 内图片、宏、所有隐藏对象或 DOC 属性及已删除修订',ocr:'OCR 可能错字、漏字；置信度不是准确率。低置信度、无文字、缩放或失败会提示人工核对'}};
  const masked=path=>detectSensitive(decodeEntities(path)).length?'[含敏感信息的路径 / 位置]':redact(decodeEntities(redact(path,terms)),terms);
  const skip=(path,reason)=>report.skipped.push({path:masked(path),reason});
  const abort=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
  if(entries.length>LIMITS.files||entries.reduce((n,e)=>n+e.file.size,0)>LIMITS.total){skip('[本次选择]','超过 300 个文件或总计 128 MiB，本次未检查。');return report;}
  for(let index=0;index<entries.length;index++){
    if(report.findings.length>=LIMITS.findings){for(const entry of entries.slice(index))skip(entry.path,'达到报告命中上限，文件未检查。');break;}
    abort();const {file,path}=entries[index],name=file.name||path.split('/').at(-1);
    let omitted=false;
    const add=(rule,location,line=null)=>{if(report.findings.length<LIMITS.findings)report.findings.push({path:masked(path),rule,location:masked(location),line});else omitted=true;};
    async function match(text,location,ocr=false){
      const lines=text.split(/\r\n|\n|\r/);
      for(let number=0;number<lines.length;number++){
        const line=lines[number],expanded=normalizedText(decodeEntities(line),ocr);
        for(let i=0;i<terms.length;i++)if(line.includes(terms[i])||expanded.includes(terms[i])||(ocr&&expanded.replace(/[ \t]/g,'').includes(terms[i].replace(/[ \t]/g,''))))add('敏感词 '+(i+1),location,number+1);
        for(const label of detectSensitive(expanded,ocr))add(label,location,number+1);
        if(report.findings.length>=LIMITS.findings){skip(path,'达到 5000 条命中上限，剩余内容未检查。');return false;}
        if(number%2000===0){await new Promise(resolve=>setTimeout(resolve,0));abort();}
      }
      return true;
    }
    for(let i=0;i<terms.length;i++)if(path.includes(terms[i])||decodeEntities(path).includes(terms[i]))add('敏感词 '+(i+1),'文件名 / 路径');
    for(const label of detectSensitive(decodeEntities(path)))add(label,'文件名 / 路径');
    if(file.size>LIMITS.file){skip(path,'超过单文件 16 MiB 限制，内容未检查。');continue;}
    let bytes;
    try {bytes=new Uint8Array(await file.arrayBuffer());}catch {skip(path,'文件无法读取。');continue;}
    abort();
    if(imageKind(bytes)||imageExtensions.test(name)){
      if(!imageKind(bytes))skip(path,'不支持的图像格式或无法识别的图像头；GPS 未检查。');
      else {try {if(await inspectGPS(bytes))add('EXIF GPS','图片元数据');report.counts.image++;}catch {skip(path,'图像容器或 EXIF 结构无法完整解析；不能判断 GPS 是否为空。');}}
      if(imageKind(bytes)){
        if(!readDocument)skip(path,'OCR 引擎不可用，图片文字未检查。');
        else try{
          const extracted=await readDocument(bytes,'image',signal);
          for(const warning of extracted.warnings)skip(path,warning);
          for(const item of extracted.ocr||[]){report.counts.ocr++;report.ocr_checks.push({...item,path:masked(path)});}
          for(const unit of extracted.units)if(!await match(unit.text,unit.location,true))break;
        }catch(error){if(error.name==='AbortError')throw error;skip(path,error.message);}
      }
    }else {
      const extension=name.includes('.')?name.split('.').at(-1).toLowerCase():'';
      const magic=String.fromCharCode(...bytes.slice(0,5));
      if(['doc','docx','pdf'].includes(extension)||magic.startsWith('%PDF')){
        if(!readDocument)skip(path,'文档解析器不可用；正文没有检查，请刷新页面后重试。');
        else {
          let extracted;
          try{extracted=await readDocument(bytes,magic.startsWith('%PDF')?'pdf':extension,signal);}
          catch(error){if(error.name==='AbortError')throw error;skip(path,error.message);}
          if(extracted){
            for(const warning of extracted.warnings)skip(path,warning);
            for(const item of extracted.ocr||[]){report.counts.ocr++;report.ocr_checks.push({...item,path:masked(path)});}
            let complete=!extracted.warnings.length;
            for(const unit of extracted.units)if(!await match(unit.text,unit.location,unit.ocr)){complete=false;break;}
            if(complete)report.counts.document++;else if(extracted.units.length)report.counts.partial_document++;
          }
        }
      }
      else if(!textExtensions.has(extension)||magic.startsWith('PK\x03\x04'))skip(path,'暂不支持此文件格式，内容没有检查。请导出为 TXT、DOCX 或 PDF 后重试；压缩包需先解压。');
      else {
        let text;
        try {
          const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
          text=new TextDecoder(encoding,{fatal:true}).decode(bytes);
          if(/[\x00-\x08\x0e-\x1f]/.test(text))throw new Error('Binary data');
        }catch {skip(path,'不支持的文本编码或二进制内容；文本未检查。');text=null;}
        if(text!==null){
          if(await match(text,'文本'))report.counts.text++;
        }
      }
    }
    if(omitted&&!report.skipped.some(item=>item.path===masked(path)))skip(path,'达到报告命中上限，该文件部分命中未列出。');
    progress(index+1,entries.length);await new Promise(resolve=>setTimeout(resolve,0));abort();
    if(report.findings.length>=LIMITS.findings){for(const entry of entries.slice(index+1))skip(entry.path,'达到报告命中上限，文件未检查。');break;}
  }
  return report;
}
