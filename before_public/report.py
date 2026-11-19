import html
import json
from pathlib import Path


def render_html(report):
    escape = lambda value: html.escape(str(value if value is not None else '—'))
    rows = ''.join('<tr>'+''.join('<td>'+escape(value)+'</td>' for value in
        (f['rule'], f['path'], f['location'], f['line'], f['commit'][:12] if f['commit'] else None))+'</tr>'
        for f in report['findings']) or '<tr><td colspan="5">未命中已配置规则。请同时查看扫描范围与未检查项。</td></tr>'
    skipped = ''.join('<li><code>'+escape(f['path'])+'</code> · '+escape(f['reason'])+'</li>' for f in report['skipped']) or '<li>范围内没有因读取失败或格式不支持而跳过的条目。</li>'
    excluded = ', '.join(report['excluded_directories']) or '无'
    document_note = escape(report.get('document_scope', '不做 OCR、人物识别、PDF/Office/压缩包解析或语义推断。'))
    return f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>公开之前 · 本地检查报告</title><style>
    *{{box-sizing:border-box}}body{{margin:0;background:#faf7f1;color:#302a40;font:16px/1.8 "Segoe UI","Microsoft YaHei",sans-serif}}main{{max-width:1100px;padding:44px 24px;margin:auto}}h1{{font-size:clamp(2.2rem,5vw,3.4rem);line-height:1.3}}h2{{font-size:1.4rem}}.eyebrow{{color:#7647a3;letter-spacing:.14em;font-size:.8rem}}.stats{{display:flex;flex-wrap:wrap;gap:16px;margin:30px 0}}.stats div{{background:white;border:1px solid #e0d7e8;flex:1;min-width:130px;padding:20px;border-radius:14px}}strong{{display:block;font-size:2rem;color:#7647a3}}section{{padding:24px;background:white;border:1px solid #e0d7e8;border-radius:14px;margin:24px 0}}.scroll{{overflow:auto}}table{{border-collapse:collapse;text-align:left;min-width:720px;width:100%;font-size:.875rem}}td,th{{border-bottom:1px solid #e0d7e8;padding:14px;vertical-align:top;overflow-wrap:anywhere}}p,li,code{{overflow-wrap:anywhere}}.note{{font-size:.875rem;color:#696171}}a{{color:#7647a3}}@media(max-width:500px){{main{{padding:28px 16px}}section{{padding:18px}}}}
    </style></head><body><main><p class="eyebrow">BEFORE PUBLIC / v0.1</p><h1>发布之前，<br>再看一眼。</h1><p>扫描范围：<code>{escape(report['mode'])}</code>。报告不包含匹配原文；配置词在路径与规则标签中也会遮盖。</p><div class="stats"><div>检查条目<strong>{report['counts']['entries']}</strong></div><div>规则命中<strong>{len(report['findings'])}</strong></div><div>未完整检查<strong>{len(report['skipped'])}</strong></div></div>
    <section><h2>需要你核对的地方</h2><p class="note">命中表示需要人工核对；不自动修改文件。小屏幕可横向滚动表格。</p><div class="scroll"><table><thead><tr><th>规则</th><th>路径</th><th>位置</th><th>行号</th><th>示例提交</th></tr></thead><tbody>{rows}</tbody></table></div></section>
    <section><h2>检查了什么，还有什么没检查</h2><p>文本条目：{report['counts']['text']} · 图像元数据条目：{report['counts']['image']} · 历史提交：{report['counts']['commits']}</p><p class="note">历史按「内容对象 + 路径」去重；提交列只列首次遇到的一个提交，不列全部出现位置。</p><ul>{skipped}</ul><p>排除的目录：<code>{escape(excluded)}</code></p><p class="note">目录模式另行排除本次规则文件及输出目录。Git 模式检查本地索引或本地 refs 可达的历史；没有自动 fetch。远端未拉取的分支、reflog、不可达对象、托管缓存与已下载副本不在范围内。</p></section>
    <p class="note">文本检查为区分大小写的配置词匹配，包含 HTML 实体解码；{document_note}图像只检查 EXIF GPS，不检查其他元数据或画面内容。未命中不等于没有隐私信息。本工具不重写 Git 历史，也不能清除网络副本。即使已遮盖配置词，报告仍含其他文件路径，应留在本地并在分享前人工审阅。</p><a href="https://github.com/ChenYueqi2024/before-public">源码与使用说明</a></main></body></html>'''


def write_report(report, output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (output/'report.html').write_text(render_html(report),encoding='utf-8')
