# dsh-gov-doc-router

**把一份格式乱七八糟的公文草稿，一键变成符合 GB/T 9704 的 .docx。** 你的政务风 DSH 界面再漂亮，公文格式还是得手动调字号、缩进、页码——这个插件替你把这一步做掉。

它是一个 DSH host 侧工具插件，注册 `gov_doc_check`：读你给的正文，按 GB/T 9704《党政机关公文格式》的高频规则逐条核对，能自动修的当场修掉（不编内容、不造机关名、不造日期），最后导出一份版式到位的 `.docx`。不生成正文，不做审批流，不连任何政务内网接口。

## 安装

```bash
dsh plugin --profile default add @liuhange/dsh-gov-doc-router
```

或本地开发时软链：

```bash
dsh plugin --profile default add D:\dsh-gov-doc-router
```

插件自带 `cordis.patch.yml`，装完即生效，无需改配置：

```yaml
- insert:
    - id: gov-doc-router
      name: '@liuhange/dsh-gov-doc-router'
```

可选配置：输出目录。留空则写到当前工作目录。

```yaml
- id: gov-doc-router
  config:
    outputDir: '~/Documents/公文'
```

## 用法

装好后直接对模型说：

> 帮我检查这份请示的格式，导出一份 docx。

```
窗口标题：关于开展2026年度安全生产大检查的请示

应急〔2026〕08号

各街道办事处:
为深入贯彻……
```

模型会调用 `gov_doc_check`，参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `content` | 是 | 公文草稿，纯文本或 Markdown。按行识别标题、发文字号、主送机关、正文、附件说明、落款、抄送。 |
| `doc_type` | 是 | `请示` / `报告` / `通知` / `函` / `纪要` / `通报`。用于校验标题是否含文种，并写入导出文件名。 |
| `output_path` | 否 | 以 `.docx` 结尾视为完整路径，否则视为目录；留空用插件配置 `outputDir`。 |

返回：

```json
{
  "doc_type": "请示",
  "issues": [
    { "rule_id": "docnum.brackets", "severity": "error", "description": "发文字号年份应使用六角括号〔〕……", "location": "发文字号（第 3 行）", "auto_fixed": true }
  ],
  "fixed_content": "……",
  "fix_summary": ["第 3 行：发文字号年份括号改为〔〕"],
  "download_url": "D:/公文/公文-请示-20261116120000.docx",
  "applied_export_rules": ["title.font", "body.font", "heading.font", "page.number", "page.line-spacing"],
  "stats": { "characters": 1200, "lines": 24, "issues": 3, "auto_fixed": 2 }
}
```

`download_url` 是本地绝对路径（正斜杠），直接打开或拖进 Word 即可。

## 规则清单

### 文本层（纯文本即可判定，可报可修）

| rule_id | 级别 | 规则 | 自动修 |
| --- | --- | --- | --- |
| `title.present` | error | 存在可识别的标题（发文字号下、主送机关上） | 否，需人工补 |
| `title.doc-type` | warning | 标题包含所选文种 | 否，不替你改标题 |
| `title.punctuation` | warning | 标题末尾不加句号/逗号/分号 | 是，去掉尾标点 |
| `docnum.brackets` | error | 发文字号年份用六角括号 `〔〕` | 是，`[]（）()` → `〔〕` |
| `docnum.serial` | warning | 发文顺序号不编虚位（`08号` → `8号`） | 是 |
| `date.format` | error | 成文日期阿拉伯数字、年月日标全、月日不补零 | 是，汉字数字/点号分隔统一 |
| `recipient.colon` | warning | 主送机关末尾用全角冒号 | 是，半角 `:` → `：` |
| `attachment.spacing` | warning | 附件说明位于正文下空一行、左空二字 | 是，补空行 + 补缩进 |
| `attachment.colon` | warning | 附件说明标签后用全角冒号「：」 | 是，半角 `:` → `：` |
| `attachment.punctuation` | warning | 附件名称后不加标点 | 是 |
| `cc.colon` | warning | 「抄送」后用全角冒号「：」 | 是，半角 `:` → `：` |
| `cc.format` | warning | 抄送机关逗号分隔、末尾句号 | 是，`、`/半角逗号 → `，`，补句号 |
| `heading.numbering` | warning | 层次序数为 `一、`/`（一）`/`1.`，二级用全角括号 | 是，`(一)` → `（一）`，`1、` → `1.` |
| `signature.block` | error | 落款含发文机关署名 + 成文日期 | 否，不伪造机关名和日期 |
| `body.indent` | warning | 正文每自然段左空二字 | 是，补全角空格缩进 |

### 导出层（纯文本读不出字体页码，只在 .docx 里落实）

| rule_id | 规则 |
| --- | --- |
| `title.font` | 标题二号小标宋体，居中 |
| `body.font` | 正文三号仿宋_GB2312，行距固定值 28 磅 |
| `heading.font` | 一级标题黑体三号，二级标题楷体_GB2312 三号 |
| `page.number` | 页码四号半角宋体，单页码居右、双页码居左，数字两侧一字线 |
| `page.line-spacing` | 全文行距固定值 28 磅 |

版心：A4（11906×16838 twips），上 3.7cm、下 3.5cm、左 2.8cm、右 2.6cm；页码位于版心下边缘之下。发文字号按下行文口径居中编排（上行文「居左空一字、与签发人同行」未实现）；成文日期与发文机关署名右空四字；抄送机关所在版记左右各空一字，并加上下分隔线。

字体、页码、行距这几项在纯文本里无法可靠判定，所以它们**不**出现在 `issues` 里假装被"检查"过，而是作为 `applied_export_rules` 如实报告"导出时已应用"。这是刻意的取舍，不制造虚假的检查结论。

## 与国标的一处刻意说明

任务口径里曾写「成文日期用阿拉伯数字，不写年/月/日」。GB/T 9704-2012 第 7.3.5 条的实际规定是：**用阿拉伯数字将年、月、日标全，年份标全称，月、日不编虚位（不补零）**，例如 `2026年11月16日`。本插件按国标实现，即 `2026年11月16日` 通过、`二〇二六年十一月十六日` 和 `2026.11.16` 报错并自动改为前者。如果你所在单位另有内部口径，请以单位口径为准，并自行调整 `src/core/parse.js` 中的 `formatDate`。

## 解析边界（请先读这一段）

- 按行识别结构：标题、发文字号、主送机关、正文段落、附件说明、落款、抄送各占独立行。Word 里手动换行（`Shift+Enter`）导致的折行会被当作独立段落。
- 标题取「主送机关上方最近的非发文字号/非日期行」；没有主送机关时取第一行。这是启发式，不是排版引擎。
- 正文缩进检查以「行首是否有两个及以上全角/半角空格」为准；Word 里用"首行缩进 2 字符"段落属性排的稿，纯文本读不出来，会误报 `body.indent`——导出后版式是正确的，只是文本层看不到。
- 不检查错别字、不检查文种使用是否恰当（请示 vs 报告的选择）、不检查内容逻辑、不检查密级与紧急程度标注。这些要么需要语义判断，要么需要单位内部规定。
- 不生成正文，不补机关名，不补日期，不猜附件名。凡是需要"编内容"才能修的，一律只报不改。

## 验证

```bash
npm test
```

22 个测试，覆盖：15 条文本规则的命中与不误报（规范样本零误报）、自动修复的幂等性与"不伪造"约束、以及解包 `.docx` 断言真实 XML（字体、字号、560 twips 固定行距、居中/首行缩进/右对齐、A4 版心、页码域与奇偶页设置、抄送版记边框）。

## License

MIT © 2026 liuhange
