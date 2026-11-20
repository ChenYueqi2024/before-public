const fs=require('fs'),path=require('path');
let Tesseract;
try{Tesseract=require('./runtime/ocr-node/node_modules/tesseract.js');}catch{try{Tesseract=require('tesseract.js');}catch{process.stderr.write('Local OCR dependencies missing.');process.exit(2);}}
(async()=>{
 let worker;
 try{
  const langPath=path.join(__dirname,'runtime/ocr/lang');for(const lang of ['chi_sim','eng'])if(!fs.existsSync(path.join(langPath,lang+'.traineddata.gz')))throw Error();
  const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>32*1024*1024)throw Error();chunks.push(chunk);}
  worker=await Tesseract.createWorker('chi_sim+eng',1,{langPath,cacheMethod:'none',gzip:true,logger:()=>{}});
  const {data}=await worker.recognize(Buffer.concat(chunks),{}, {text:true,blocks:true});
  const lowWord=(data.blocks||[]).some(b=>b.paragraphs?.some(p=>p.lines?.some(l=>l.words?.some(w=>w.text?.length>=3&&w.confidence<40))));
  if(data.text.length>4*1024*1024)throw Error();
  process.stdout.write(JSON.stringify({text:data.text,confidence:Math.round(data.confidence||0),low:lowWord||data.confidence<65}));
 }catch{process.stderr.write('OCR failed; no content emitted.');process.exitCode=2;}
 finally{if(worker)await worker.terminate();}
})();
