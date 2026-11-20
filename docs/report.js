export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function outcome(report){
  const done=report.counts.text+report.counts.image+(report.counts.document||0)+(report.counts.partial_document||0),hits=report.findings.length;
  if(report.skipped.length)return {kind:done?'warning':'error',title:done?'检查部分完成':'未能完整检查所选文件',message:`${report.skipped.length} 项内容未检查或未检查完整。${hits?'已发现 '+hits+' 处命中，请一并查看。':'“0 命中”不能作为检查通过的结论。'}请查看下方原因与处理建议。`};
  return {kind:hits?'warning':'success',title:hits?'检查完成，发现需要留意的内容':'检查完成',message:hits?`发现 ${hits} 处命中，请查看文件位置并人工确认。`:'在所选文件、本次规则与支持范围内未发现命中；不代表所有隐私风险都已排除。'};
}
export function reportBody(report) {
  const state=outcome(report);
  const rows=report.findings.map(item=>`<tr><td>${escapeHTML(item.path)}</td><td>${escapeHTML(item.rule)}</td><td>${escapeHTML(item.location)}${item.line?' · 第 '+item.line+' 行':''}</td></tr>`).join('');
  const skips=report.skipped.map(item=>`<li><strong>${escapeHTML(item.path)}</strong>：${escapeHTML(item.reason)}</li>`).join('');
  return `<div class="result-state ${state.kind}"><h3>${state.title}</h3><p>${state.message}</p></div><p>${report.counts.entries} 个所选文件 · ${report.counts.text} 个纯文本、${report.counts.document||0} 个 Word / PDF 完成文字匹配 · ${report.counts.image} 张图片完成 EXIF GPS 检查</p>
    <p>规则：${report.coverage.terms} 个自定义敏感词，以及内置姓名字段、号码和密钥候选规则。报告不包含匹配原文、完整号码、密钥或 GPS 坐标。</p>
    ${report.ocr_checks?.length?'<h3>OCR 已识别 '+report.ocr_checks.length+' 张图 / 页</h3><ul>'+report.ocr_checks.map(item=>'<li>'+escapeHTML(item.path)+' · '+escapeHTML(item.location)+' · 置信度 '+item.confidence+'/100（不是准确率）</li>').join('')+'</ul>':''}
    ${rows?'<div class="table-wrap"><table><thead><tr><th>文件</th><th>命中规则</th><th>位置</th></tr></thead><tbody>'+rows+'</tbody></table></div>':''}
    <h3>未完成的内容与处理建议：${report.skipped.length} 项</h3>${skips?'<ul>'+skips+'</ul>':'<p>本次支持范围内没有未检查项。</p>'}
    <p class="note">${escapeHTML(report.coverage.scope)}。${escapeHTML(report.coverage.images)}。${escapeHTML(report.coverage.documents||'')}。${escapeHTML(report.coverage.automatic||'')}。${escapeHTML(report.coverage.ocr||'')}。文档行号为提取文本行号，并非 Word 排版行号。未命中不代表没有隐私信息；其余文件名仍在报告中，分享前请核对。</p>`;
}
export function reportHTML(report) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>公开之前 · 检查报告</title><style>body{max-width:960px;margin:40px auto;padding:0 20px;font:16px/1.8 sans-serif;color:#302a40}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ddd;text-align:left;overflow-wrap:anywhere}.table-wrap{overflow:auto}li{overflow-wrap:anywhere}.note{color:#655c70}</style><h1>公开之前 · 浏览器检查报告</h1>${reportBody(report)}</html>`;
}
