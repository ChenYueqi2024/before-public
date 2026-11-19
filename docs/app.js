import {parseTerms,scanFiles} from './scanner.js';
import {reportBody,reportHTML} from './report.js';
import {samples,sampleTerms} from './samples.js';

const $=id=>document.getElementById(id);
let entries=[],report=null,controller=null;
const decoder=document.createElement('textarea');
// Only an isolated entity is decoded: untrusted file contents never enter a DOM parser.
function decodeEntities(text){return text.replace(/&(?:#[xX][0-9a-fA-F]+;?|#[0-9]+;?|[a-zA-Z][a-zA-Z0-9]+;)/g,entity=>{decoder.innerHTML=entity;return decoder.value;});}
function invalidate(message='材料已更新，请开始检查。'){
  controller?.abort();controller=null;report=null;$('results').hidden=true;$('report').replaceChildren();$('cancel').hidden=true;
  $('scan').disabled=!entries.length;$('status').textContent=message;
}
function selection(sample=false){ $('selection').textContent=entries.length?`${sample?'正在使用合成样例':'已选择'} ${entries.length} 个文件 · ${(entries.reduce((n,e)=>n+e.file.size,0)/1024).toFixed(1)} KiB`:'尚未选择文件'; }
$('files').addEventListener('change',()=>{entries=Array.from($('files').files,file=>({file,path:file.name}));selection();invalidate();});
$('terms').addEventListener('input',()=>invalidate());
$('clear').addEventListener('click',()=>{entries=[];$('files').value='';$('terms').value='';selection();invalidate('本次材料和报告已清空。');});
$('cancel').addEventListener('click',()=>invalidate('检查已取消，没有生成部分报告。'));
async function run(){
  invalidate();let terms;try{terms=parseTerms($('terms').value);}catch(error){$('status').textContent=error.message;return;}
  const active=new AbortController();controller=active;$('scan').disabled=true;$('cancel').hidden=false;$('status').textContent='正在本地检查…';
  try{
    const result=await scanFiles(entries,terms,{signal:active.signal,decodeEntities,progress:(done,total)=>{if(controller===active)$('status').textContent=`正在本地检查 ${done} / ${total}…`;}});
    if(controller!==active)return;report=result;
    $('file-count').textContent=report.counts.entries;$('hit-count').textContent=report.findings.length;$('skip-count').textContent=report.skipped.length;
    $('report').innerHTML=reportBody(report);$('results').hidden=false;
    $('status').textContent=report.skipped.length?'检查结束，有未完整检查的项目，请查看报告。':'检查完成。结果仅对应所选文件与本次规则。';
  }catch(error){if(controller===active)$('status').textContent=error.name==='AbortError'?'检查已取消。':'检查未完成，请减少文件数量后重试。';}
  finally{if(controller===active){controller=null;$('cancel').hidden=true;$('scan').disabled=!entries.length;}}
}
$('scan').addEventListener('click',run);
$('sample').addEventListener('click',()=>{
  invalidate();$('files').value='';$('terms').value=sampleTerms.join('\n');
  entries=samples.map(sample=>{const bytes=Uint8Array.from(atob(sample.base64),char=>char.charCodeAt(0));const file=new File([bytes],sample.name);return {file,path:sample.name};});selection(true);run();
});
function download(format){if(!report)return;const blob=new Blob([format==='json'?JSON.stringify(report,null,2):reportHTML(report)],{type:format==='json'?'application/json':'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='before-public-report.'+format;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('json').addEventListener('click',()=>download('json'));$('html').addEventListener('click',()=>download('html'));
for(const id of ['files','terms','sample','clear'])$(id).disabled=false;
$('status').textContent='已就绪。文件只在当前浏览器中检查。';
