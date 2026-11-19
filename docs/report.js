export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function reportBody(report) {
  const rows=report.findings.map(item=>`<tr><td>${escapeHTML(item.path)}</td><td>${escapeHTML(item.rule)}</td><td>${escapeHTML(item.location)}${item.line?' · 第 '+item.line+' 行':''}</td></tr>`).join('');
  const skips=report.skipped.map(item=>`<li><strong>${escapeHTML(item.path)}</strong>：${escapeHTML(item.reason)}</li>`).join('');
  return `<p>${report.counts.entries} 个所选文件 · ${report.counts.text} 个文本完成匹配 · ${report.counts.image} 张图片完成 EXIF GPS 检查</p>
    <h3>${report.findings.length?'发现 '+report.findings.length+' 处需要留意的地方':'在已检查范围内未发现命中'}${report.skipped.length?' · 检查不完整':''}</h3>
    <p>规则：${report.coverage.terms} 个敏感词（编号对应输入顺序；重复词只保留第一次）。报告不包含匹配原文或 GPS 坐标。</p>
    ${rows?'<div class="table-wrap"><table><thead><tr><th>文件</th><th>命中规则</th><th>位置</th></tr></thead><tbody>'+rows+'</tbody></table></div>':''}
    <h3>未完整检查：${report.skipped.length} 项</h3>${skips?'<ul>'+skips+'</ul>':'<p>本次没有未检查项。</p>'}
    <p class="note">${escapeHTML(report.coverage.scope)}。${escapeHTML(report.coverage.images)}。未命中不代表没有隐私信息；其余文件名仍在报告中，分享前请核对。</p>`;
}
export function reportHTML(report) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>公开之前 · 检查报告</title><style>body{max-width:960px;margin:40px auto;padding:0 20px;font:16px/1.8 sans-serif;color:#302a40}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ddd;text-align:left;overflow-wrap:anywhere}.table-wrap{overflow:auto}li{overflow-wrap:anywhere}.note{color:#655c70}</style><h1>公开之前 · 浏览器检查报告</h1>${reportBody(report)}</html>`;
}
