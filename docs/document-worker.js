import {extractDocument} from './documents.js';
import {prepareOCR,recognizeImage,imageOCR} from './ocr.js';
self.onmessage=async({data})=>{
  try{self.postMessage({id:data.id,result:data.extension==='image'?await imageOCR(data.bytes):await extractDocument(data.bytes,data.extension,{ocr:recognizeImage,progress:message=>self.postMessage({progress:message})})});}
  catch(error){
    // Parser errors can contain document text: only fixed messages leave this worker.
    const message=error.name==='PasswordException'||error.message==='encrypted'?'文档已加密或需要密码，请在本机解密后重新选择。':
      /^(文档提取文本超过|DOCX 解压内容超过|不是可读取的 DOCX|无法识别旧版 Word|PDF 超过|OCR 超过|图片超过|图片尺寸无法)/.test(error.message)?error.message:
      data.extension==='image'?'图片 OCR 未完成，可能无法解码。请在本机重新另存为 JPEG / PNG / WebP 后重试。':'文档解析失败，可能损坏、加密或使用了不支持的结构。请用 Word / PDF 阅读器重新另存后重试。';
    self.postMessage({id:data.id,error:message});
  }
};
try{await prepareOCR(progress=>self.postMessage({progress}));self.postMessage({ready:true});}
catch{self.postMessage({startupError:'本地 OCR 引擎或模型加载失败，请联网刷新重试；文件未发送。'});}
