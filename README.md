# 公开之前 · before-public

给准备公开的个人网站，再做一次本地检查：配置词是否还在页面、元信息或文件名里？图片是否带着 EXIF GPS？删掉的文件是否仍在 Git 历史中？

[打开浏览器检查](https://chenyueqi2024.github.io/before-public/) · [本地工具示例报告](https://chenyueqi2024.github.io/before-public/demo-report.html)

浏览器版 v0.2；原有 Python v0.1 本地工具继续保留。**只检查和报告，不修改文件、不重写历史、不上传数据。** 未命中不等于没有隐私信息。

## 浏览器检查

1. 打开网页，多选准备公开的文件；或点击「先用合成样例试试」。
2. 每行填写一个敏感词，点击「开始检查」。精确匹配、区分大小写，重复词合并。留空时只检查 GPS，文本列为未检查。
3. 查看命中位置与未完整检查项，按需保存 JSON 或独立 HTML 报告。修改文件或规则后，旧报告立即失效；可取消检查或清空本次材料。

文件和规则仅在当前浏览器内处理，不上传、不写网站存储，无 API、统计脚本或外部 CDN。页面与解析库首次加载需要网络；加载完成后可断网检查和导出。CSP 禁止网络连接，EXIF 解析库随站点提供，来源与许可见 [vendor](docs/vendor/README.md)。

- 敏感词：所选文件名、常见纯文本格式（UTF-8、带 BOM 的 UTF-16），支持 HTML 实体；报告只写规则编号、文件和行号，不写匹配原文。浏览器文件选择不提供完整原始路径。
- 图像：JPEG、PNG、WebP 的 EXIF GPS 目录，包括部分 GPS 字段；不显示坐标。不验证像素解码，不检查 XMP、IPTC、画面内容或其他 EXIF 隐私字段。
- PDF、Office、压缩包、其他图像格式、损坏元数据和不支持的编码会列入未检查项，不能当作检查通过。
- 限制：300 个文件、总计 128 MiB、单文件 16 MiB；50 个敏感词，每词 200 字符；最多 5000 条命中，后续未检查范围写入报告。
- 报告会遮盖路径中的匹配词，但仍可能保留其他个人信息，分享前请人工核对。不会自动识别所有姓名、电话或密钥。
- **浏览器版不读 Git 历史、暂存区，也不实现 `forbidden_paths` 规则。** 以下本地工具继续支持这些功能。浏览器合成样例为 3 处命中；本地示例另有禁止路径规则，共 4 处。

## 安装与运行

Python 3.10+；Git 模式需要可在命令行运行的 Git。

```sh
git clone https://github.com/ChenYueqi2024/before-public.git
cd before-public
python -m pip install .
before-public examples/site --config examples/privacy.example.json --output demo-report
```

打开 `demo-report/report.html`。另有 `report.json` 供脚本读取。未安装命令入口时，也可在源码目录运行 `python -m before_public ...`。

把自己的规则文件放在待公开仓库**外部**，不要提交它。规则示例：

```json
{
  "terms": [
    {"label": "Private name", "value": "Sample Private Person"},
    {"label": "Private email", "value": "private@example.invalid"}
  ],
  "forbidden_paths": ["assets/old-photo.jpg"]
}
```

示例人物、邮箱、图片和坐标都是合成测试材料。`label` 是报告展示名；`value` 是区分大小写的匹配词。可以添加姓名、手机号、地址等已知字符串。路径为相对目标根目录、使用 `/` 分隔的精确路径，不是 glob。

```sh
# 当前文件目录
before-public /path/to/site --config /private/rules.json --output /private/current-report
# 整个 Git 索引快照：即下一次提交的文件状态，不只检查本次变更文件
before-public /path/to/repo --mode staged --config /private/rules.json --output /private/staged-report
# 本地所有 refs 可达的提交
before-public /path/to/repo --mode history --config /private/rules.json --output /private/history-report
```

三个命令各自运行。报告注明扫描范围，不能用目录扫描代替历史扫描。Git 模式必须传仓库根目录。

## 已实现

- UTF-8、带 BOM 的 UTF-16 文本；按行匹配配置词，也解码 HTML 实体以检查元信息。
- 文件路径中的配置词和禁止公开的精确路径。
- Pillow 可读取图像的 EXIF GPS 存在性，不在报告中写出坐标。
- 暂存区直接读 Git 对象；工作区修改不会掩盖暂存内容。
- 历史按「内容对象 + 路径」去重，记录一个包含它的提交。已删除文件仍可检出。
- JSON/独立 HTML 报告；不写匹配原文；路径、标签内的配置词也遮盖；HTML 转义。
- 超限、无法读取、二进制格式、链接和子模块等未检查项单独列出。

退出码：`0` = 范围内无命中且无未检查项；`1` = 有命中；`2` = 输入/运行错误，或有未完整检查项（即使同时存在命中）。自动化应同时检查退出码与报告。

## 范围与限制

- 单个文件/对象上限 16 MiB；目录模式排除 `.git`、`.venv`、`venv`、`node_modules`、`__pycache__`、本次规则文件和输出目录。报告列出被排除的目录。不跟随符号链接。
- Git 模式没有上述目录过滤；已经被 Git 跟踪的规则文件也会检查。它检查的是本地索引或本地 refs 可达历史，不自动 fetch。远端未拉取分支、reflog、不可达对象、GitHub 缓存、部署产物与他人副本不在范围内。
- Git LFS 文件仅检查本地 Git 中的指针，不读取 LFS 远端对象。子模块不递归。
- 文本匹配不做语义推断、模糊匹配、大小写归一化、跨行拼接、OCR、PDF/Office/压缩包解析或字符转义穷举。
- 图像只检查 EXIF GPS，**不识别真人照片，不识别图片里的姓名，不检查其他 EXIF/XMP 字段**。请把已知的真人照片路径加入 `forbidden_paths` 并人工看图。
- 报告仍含未配置遮盖的文件名、目录结构和提交标识，应留在本地，分享前人工审阅。
- 历史扫描会读取每个可达提交的文件树，适合个人小型仓库；大仓库可能较慢。没有做大型仓库性能评估。
- 本工具不能清除托管平台缓存或已下载副本，也不能证明信息从互联网消失。

## 开发验证

```sh
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python examples/build_samples.py
```

测试使用临时 Git 仓库验证暂存内容、删除后历史、其他分支、特殊文件名、HTML 转义与报告遮盖；图像 GPS 与网站均为合成样例。Linux CI 另覆盖 Windows 无权限时无法创建的符号链接。

浏览器核心测试覆盖三种图像格式的有/无 GPS、部分 GPS 字段、损坏元数据、文本编码、实体、遮盖、超限与取消。`examples/build_samples.py` 可重建合成图片与内置演示；浏览器端没有构建或 npm 安装步骤。用静态 HTTP 服务打开 `docs/`，请勿直接用 `file://` 加载 ES 模块。

MIT License · Yueqi
