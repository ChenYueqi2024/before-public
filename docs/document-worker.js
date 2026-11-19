import {extractDocument} from './documents.js';
self.onmessage=async({data})=>{
  try{self.postMessage({id:data.id,result:await extractDocument(data.bytes,data.extension)});}
  catch(error){
    // Parser errors can contain document text: only fixed messages leave this worker.
    const message=error.name==='PasswordException'||error.message==='encrypted'?'文档已加密或需要密码，请在本机解密后重新选择。':
      /^(文档提取文本超过|DOCX 解压内容超过|不是可读取的 DOCX|无法识别旧版 Word|PDF 超过)/.test(error.message)?error.message:
      '文档解析失败，可能损坏、加密或使用了不支持的结构。请用 Word / PDF 阅读器重新另存后重试。';
    self.postMessage({id:data.id,error:message});
  }
};
self.postMessage({ready:true});
