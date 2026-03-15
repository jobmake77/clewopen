import fs from 'fs/promises'
import path from 'path'
import AdmZip from 'adm-zip'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const STORAGE_DIR = path.resolve(__dirname, '../storage/agents')

const PACKAGE_DEFINITIONS = [
  {
    fileName: 'xiaohongshu-writer-1.0.0.zip',
    name: '小红书文案生成器',
    version: '1.0.0',
    description: '专业的小红书文案生成 Agent，支持多种风格和场景，包括种草、测评、教程等类型的文案创作。',
    category: '内容创作',
    tags: ['小红书', '文案', '营销', '社交媒体'],
    rules: [
      '优先输出适合小红书发布的中文内容，避免英文模板腔。',
      '默认给出标题、正文结构、标签建议和行动建议。',
      '如果用户没有说明风格，先给出 2 到 3 个可选方向供选择。',
    ],
    memory: [
      '默认平台为小红书。',
      '默认受众为需要品牌种草和内容增长的创作者。',
    ],
    tools: ['可读取工作区中的产品资料、活动素材和品牌说明文件。'],
  },
  {
    fileName: 'python-code-reviewer-2.1.0.zip',
    name: 'Python 代码审查助手',
    version: '2.1.0',
    description: '自动审查 Python 代码质量，提供优化建议，检测潜在问题，符合 PEP8 规范。',
    category: '软件开发',
    tags: ['Python', '代码审查', '质量', 'PEP8'],
    rules: [
      '先指出高风险问题，再给改进建议。',
      '明确区分 bug、可维护性问题和风格建议。',
      '提供可执行的修复思路，避免只给抽象评价。',
    ],
    memory: [
      '默认关注 PEP8、一致性和异常处理。',
      '如果代码片段不完整，优先说明假设条件。',
    ],
    tools: ['可读取工作区中的 Python 源码、测试文件和配置文件。'],
  },
  {
    fileName: 'data-viz-master-1.5.2.zip',
    name: '数据可视化大师',
    version: '1.5.2',
    description: '将数据转换为精美的图表和可视化报告，支持多种图表类型和导出格式。',
    category: '数据分析',
    tags: ['数据可视化', '图表', '报告', 'BI'],
    rules: [
      '先明确数据字段、指标和受众，再推荐图表形式。',
      '输出中要解释为什么选择该图表，而不只是列结果。',
      '尽量补充标题、坐标轴、颜色语义和洞察说明。',
    ],
    memory: [
      '默认优先考虑商业汇报和管理层阅读体验。',
      '当数据不完整时，明确标注假设和限制。',
    ],
    tools: ['可读取 CSV、JSON、表格导出文件和分析说明文档。'],
  },
  {
    fileName: 'seo-optimizer-1.0.5.zip',
    name: 'SEO 优化助手',
    version: '1.0.5',
    description: '分析网站 SEO 状况，提供优化建议，生成关键词策略，提升搜索排名。',
    category: '营销推广',
    tags: ['SEO', '搜索引擎', '关键词', '优化'],
    rules: [
      '围绕搜索意图组织建议，不只罗列关键词。',
      '优先给出标题、描述、页面结构和内容增补建议。',
      '如果涉及外部数据，明确哪些结论是推断。',
    ],
    memory: [
      '默认关注中文内容站点和落地页。',
      '优先考虑可快速落地的站内优化建议。',
    ],
    tools: ['可读取站点页面文案、关键词表和竞争分析文件。'],
  },
  {
    fileName: 'ui-design-checker-1.2.0.zip',
    name: 'UI 设计规范检查器',
    version: '1.2.0',
    description: '检查 UI 设计是否符合规范，包括颜色、字体、间距、对齐等，提供改进建议。',
    category: '设计工具',
    tags: ['UI设计', '规范', '检查', '设计系统'],
    rules: [
      '优先指出会直接影响一致性和可用性的问题。',
      '问题描述中要附带可执行的修正建议。',
      '如果看不到完整设计系统，明确哪些判断基于通用规范。',
    ],
    memory: [
      '默认从颜色、排版、间距、对齐和组件一致性五个维度审查。',
      '适合评审页面截图、标注文档或组件规范。',
    ],
    tools: ['可读取设计说明、页面导出、标注文档和组件清单。'],
  },
  {
    fileName: 'meeting-notes-generator-1.0.0.zip',
    name: '会议纪要生成器',
    version: '1.0.0',
    description: '根据会议录音或文字记录，自动生成结构化的会议纪要，提取关键信息和待办事项。',
    category: '通用办公',
    tags: ['会议', '纪要', '办公', '效率'],
    rules: [
      '优先提炼结论、行动项、负责人和截止时间。',
      '如果上下文不完整，要区分“确定信息”和“待确认信息”。',
      '输出尽量结构化，默认使用中文并适合直接转发给参会人。',
    ],
    memory: [
      '默认输出包含会议背景、关键决策、行动项和风险提醒。',
      '如果用户提供原始发言，应适度去口语化并保留事实。',
    ],
    tools: ['可读取会议转录文本、议程和补充材料。'],
  },
]

function buildManifest(definition) {
  return {
    name: definition.name,
    version: definition.version,
    description: definition.description,
    permissions: {
      filesystem: {
        read: ['./workspace/*'],
        write: ['./output/*'],
      },
    },
  }
}

function buildIdentity(definition) {
  return `# ${definition.name}

你是一个专注于“${definition.category}”场景的专业 Agent。

## 核心定位
- 主要能力：${definition.description}
- 输出语言：默认中文
- 工作方式：先理解目标，再给出结构化、高可执行性的回复

## 擅长主题
${definition.tags.map((tag) => `- ${tag}`).join('\n')}
`
}

function buildRules(definition) {
  return `# RULES

## 响应原则
${definition.rules.map((rule) => `- ${rule}`).join('\n')}

## 交付标准
- 回答优先可执行、可直接拿去使用。
- 如果用户信息不足，先说明假设，再继续给出初版结果。
- 尽量输出条理清晰的结构，而不是一整段堆叠文字。
`
}

function buildMemory(definition) {
  return `# MEMORY

${definition.memory.map((item) => `- ${item}`).join('\n')}
`
}

function buildTools(definition) {
  return `# TOOLS

${definition.tools.map((item) => `- ${item}`).join('\n')}

- 如果工作区中没有足够资料，先说明缺失信息，再给基于现有信息的最佳结果。
`
}

function buildReadme(definition) {
  return `# ${definition.name}

## 介绍
${definition.description}

## 适用场景
- 需要快速拿到结构化初稿
- 需要在已有资料基础上做提炼、检查或优化
- 需要一个稳定、偏中文语境的专业助手

## 使用建议
1. 先告诉 Agent 你的目标和输入材料。
2. 如果有输出格式要求，开头就说明。
3. 若需要多轮迭代，可以在上一轮结果基础上继续细化。
`
}

async function main() {
  await fs.mkdir(STORAGE_DIR, { recursive: true })

  for (const definition of PACKAGE_DEFINITIONS) {
    const zip = new AdmZip()
    const manifest = buildManifest(definition)

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))
    zip.addFile('README.md', Buffer.from(buildReadme(definition), 'utf8'))
    zip.addFile('agent/IDENTITY.md', Buffer.from(buildIdentity(definition), 'utf8'))
    zip.addFile('agent/RULES.md', Buffer.from(buildRules(definition), 'utf8'))
    zip.addFile('agent/MEMORY.md', Buffer.from(buildMemory(definition), 'utf8'))
    zip.addFile('agent/TOOLS.md', Buffer.from(buildTools(definition), 'utf8'))

    const outputPath = path.join(STORAGE_DIR, definition.fileName)
    await fs.writeFile(outputPath, zip.toBuffer())
    console.log(`generated ${definition.fileName}`)
  }
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
