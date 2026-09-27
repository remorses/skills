// Convert a markdown file into an x.com article content_state JSON.
// Usage: bun md-to-content-state.ts <input.md> <output.json>
import fs from 'node:fs'

// X shows the fence language as the code block label.
const LANG: Record<string, string> = { ts: 'typescript', js: 'javascript', sh: 'bash' }

type Block = {
  key: string
  text: string
  type: string
  data: {}
  entity_ranges: { key: number; offset: number; length: number }[]
  inline_style_ranges: { offset: number; length: number; style: string }[]
}

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('usage: md-to-content-state.ts <input.md> <output.json>')

const lines = fs
  .readFileSync(input, 'utf8')
  .replace(/^---\n[\s\S]*?\n---\n/, '')
  .split('\n')

const blocks: Block[] = []
const entity_map: { key: string; value: { type: 'MARKDOWN'; mutability: 'Mutable'; data: { markdown: string } } }[] = []

const push = (type: string, text: string, entity_ranges: Block['entity_ranges'] = []) => {
  blocks.push({ key: `k${blocks.length}`, text, type, data: {}, entity_ranges, inline_style_ranges: [] })
}
// X articles have no inline code style.
const inline = (s: string) => s.replace(/`([^`]+)`/g, '$1')

let paragraph: string[] = []
const flush = () => {
  if (paragraph.length) push('unstyled', inline(paragraph.join(' ')))
  paragraph = []
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]!
  if (line.startsWith('```')) {
    flush()
    const raw = line.slice(3).trim()
    const code: string[] = []
    while (i + 1 < lines.length && !lines[++i]!.startsWith('```')) code.push(lines[i]!)
    const key = entity_map.length
    entity_map.push({
      key: String(key),
      value: { type: 'MARKDOWN', mutability: 'Mutable', data: { markdown: '```' + (LANG[raw] ?? raw) + '\n' + code.join('\n') + '\n```' } },
    })
    push('atomic', ' ', [{ key, offset: 0, length: 1 }])
  } else if (line.startsWith('# ')) {
    flush() // the article title is a separate field
  } else if (/^#{2,} /.test(line)) {
    flush()
    push('header-two', inline(line.replace(/^#+ /, '')))
  } else if (/^[-*] /.test(line)) {
    flush()
    push('unordered-list-item', inline(line.slice(2)))
  } else if (/^\d+\. /.test(line)) {
    flush()
    push('ordered-list-item', inline(line.replace(/^\d+\. /, '')))
  } else if (line.trim() === '') {
    flush()
  } else {
    paragraph.push(line.trim())
  }
}
flush()

fs.writeFileSync(output, JSON.stringify({ blocks, entity_map }, null, 2))
console.log(`wrote ${blocks.length} blocks, ${entity_map.length} code blocks to ${output}`)
for (const b of blocks) console.log(b.type.padEnd(20), b.text.slice(0, 70))
