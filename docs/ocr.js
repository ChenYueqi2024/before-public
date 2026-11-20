import Tesseract from './vendor/ocr/tesseract.js';
let promise;
export function prepareOCR(progress=()=>{}){
  if(!promise)promise=Tesseract.createWorker('chi_sim+eng',1,{
    workerPath:new URL('./vendor/ocr/worker.min.js',import.meta.url).href,
    corePath:new URL('./vendor/ocr/',import.meta.url).href,
    langPath:new URL('./vendor/ocr/lang/',import.meta.url).href,
    workerBlobURL:false,cacheMethod:'none',gzip:true,logger:message=>progress(`${message.status==='recognizing text'?'正在本地识别文字':'正在准备本地中英文 OCR 模型'}（当前步骤 ${Math.round((message.progress||0)*100)}%）…`)
  });
  return promise;
}
export async function recognizeImage(bytes){
  const worker=await prepareOCR();let timer;
  try{
    const result=await Promise.race([worker.recognize(bytes,{}, {text:true,blocks:true}),new Promise((_,reject)=>{timer=setTimeout(()=>{worker.terminate();promise=null;reject(Error('OCR 超过单页 60 秒限制，请缩小图片或拆分文件后重试。'));},60000);})]);
    const {text,confidence,blocks}=result.data;
    const lowWord=(blocks||[]).some(block=>block.paragraphs?.some(paragraph=>paragraph.lines?.some(line=>line.words?.some(word=>word.text?.length>=3&&word.confidence<40))));
    const warnings=[];
    if(!text?.trim())warnings.push('OCR 未识别到文字；可能是无文字图片、模糊或不支持的文字，需人工核对。');
    else if(confidence<65||lowWord)warnings.push('OCR 识别置信度偏低，可能漏字或错字；请人工核对原图。');
    return {text:text||'',confidence:Math.round(confidence||0),warnings};
  }finally{clearTimeout(timer);}
}

// Encoded dimensions are checked before allocating a decoded bitmap.
export function imageSize(bytes){
  const b=bytes,v=new DataView(b.buffer,b.byteOffset,b.byteLength),ascii=(s,n)=>String.fromCharCode(...b.slice(s,s+n));
  if(b.length>=24&&b[0]===137&&ascii(12,4)==='IHDR')return [v.getUint32(16),v.getUint32(20)];
  if(b[0]===255&&b[1]===216){let p=2;while(p+4<=b.length){if(b[p++]!==255)break;while(b[p]===255)p++;const m=b[p++];if(m===217||m===218)break;if(m===1||(m>=208&&m<=215))continue;const n=v.getUint16(p);if(n<2||p+n>b.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m)&&n>=8)return [v.getUint16(p+5),v.getUint16(p+3)];p+=n;}}
  if(b.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
    const type=ascii(12,4);if(type==='VP8X')return [1+b[24]+(b[25]<<8)+(b[26]<<16),1+b[27]+(b[28]<<8)+(b[29]<<16)];
    if(type==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42)return [v.getUint16(26,true)&16383,v.getUint16(28,true)&16383];
    if(type==='VP8L'&&b[20]===47)return [1+(b[21]|(b[22]&63)<<8),1+((b[22]>>6)|b[23]<<2|(b[24]&15)<<10)];
  }
  throw Error('图片尺寸无法读取，OCR 未完成。');
}
export async function imageOCR(bytes){
  const [width,height]=imageSize(bytes);if(!width||!height||width*height>12000000)throw Error('图片超过 1200 万像素或尺寸无效，OCR 未完成；请缩小后重试。');
  const bitmap=await createImageBitmap(new Blob([bytes]));
  try{
    const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height)),canvas=new OffscreenCanvas(Math.ceil(bitmap.width*scale),Math.ceil(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const result=await recognizeImage(new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer()));
    if(scale<1)result.warnings.push('图片为控制资源使用已缩小到最长边 2400 像素；细小文字可能漏检。');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),png=bytes[0]===137;
    for(let offset=png?8:12;offset+8<=bytes.length;){
      if(!png&&bytes[0]!==82)break;
      const type=String.fromCharCode(...bytes.slice(offset+(png?4:0),offset+(png?8:4)));
      if(type==='acTL'||type==='ANIM'){result.warnings.push('动画仅检查首帧，其他帧文字请分别导出检查。');break;}
      const size=view.getUint32(offset+(png?0:4),!png);offset+=size+(png?12:8)+(png?0:size%2);
    }
    return {units:[{text:result.text,location:'图片 OCR',ocr:true}],warnings:result.warnings,ocr:[{location:'图片 OCR',confidence:result.confidence}]};
  }finally{bitmap.close();}
}
