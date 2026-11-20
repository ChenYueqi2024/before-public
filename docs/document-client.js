let worker,ready,pending=null,sequence=0,progress=()=>{};
function reset(){worker?.terminate();worker=null;ready=null;}
export function prepareDocuments(onProgress){
  if(onProgress)progress=onProgress;
  if(ready)return ready;
  ready=new Promise((resolve,reject)=>{
    worker=new Worker(new URL('./document-worker.js',import.meta.url),{type:'module'});
    const timer=setTimeout(()=>{reset();reject(Error('文档 / OCR 模型加载超时，请联网刷新页面后重试。'));},90000);
    worker.onmessage=({data})=>{
      if(data.progress)progress(data.progress);
      else if(data.startupError){clearTimeout(timer);reset();reject(Error(data.startupError));}
      else if(data.ready){clearTimeout(timer);resolve();}
      else if(pending&&data.id===pending.id){const active=pending;pending=null;data.error?active.reject(Error(data.error)):active.resolve(data.result);}
    };
    worker.onerror=()=>{clearTimeout(timer);const error=Error('文档解析器未能运行，请使用新版浏览器刷新重试。');pending?.reject(error);pending=null;reset();reject(error);};
  });
  return ready;
}
export async function readDocument(bytes,extension,signal){
  await prepareDocuments();if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  return new Promise((resolve,reject)=>{
    const abort=()=>{reset();finish(reject,new DOMException('Cancelled','AbortError'));};
    const timer=setTimeout(()=>{reset();finish(reject,Error('文档 / OCR 检查超过 180 秒，已停止。请缩小或拆分文件后重试。'));},180000);
    function finish(callback,value){clearTimeout(timer);signal?.removeEventListener('abort',abort);pending=null;callback(value);}
    pending={id:++sequence,resolve:value=>finish(resolve,value),reject:error=>finish(reject,error)};
    signal?.addEventListener('abort',abort,{once:true});worker.postMessage({id:sequence,bytes,extension});
  });
}
