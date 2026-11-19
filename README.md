# 公开之前 · before-public

给准备公开的个人网站，再做一次本地检查：配置词是否还在页面、元信息或文件名里？图片是否带着 EXIF GPS？删掉的文件是否仍在 Git 历史中？

[查看合成示例](https://chenyueqi2024.github.io/before-public/) · [示例报告](https://chenyueqi2024.github.io/before-public/demo-report.html)

这是 v0.1 基础版。**只检查和报告，不修改文件、不重写历史、不上传数据。** 未命中不等于没有隐私信息。

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
python examples/build_samples.py
```

测试使用临时 Git 仓库验证暂存内容、删除后历史、其他分支、特殊文件名、HTML 转义与报告遮盖；图像 GPS 与网站均为合成样例。Linux CI 另覆盖 Windows 无权限时无法创建的符号链接。

MIT License · Yueqi
