import libraries from './runtime/word-xml.mjs';
try{
  const chunks=[];let size=0;
  for await(const chunk of process.stdin){size+=chunk.length;if(size>16*1024*1024)throw Error();chunks.push(chunk);}
  const doc=await libraries.extractDoc(Buffer.concat(chunks));
  const units=['getBody','getHeaders','getFooters','getFootnotes','getEndnotes','getAnnotations','getTextboxes'].map(method=>({location:'DOC '+method.slice(3),text:doc[method]({filterUnicode:false,includeFooters:false})}));
  if(units.reduce((sum,unit)=>sum+unit.text.length,0)>4*1024*1024)throw Error();
  process.stdout.write(JSON.stringify(units));
}catch{process.stderr.write('DOC extraction failed or exceeded limits.');process.exitCode=2;}
