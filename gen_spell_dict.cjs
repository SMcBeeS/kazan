// gen_spell_dict.cjs — one-pass dictionary auto-generator for this project.
//
// Strategy: run cspell lint on the source tree, collect every flagged token
// (the exact string cSpell is flagging), and append it (lowercased, deduped)
// to cspell-words.txt. Run once to build a fresh dictionary, rerun anytime
// Arabic strings change.
//
//   node gen_spell_dict.cjs
//
const { execSync } = require('child_process')
const fs = require('fs')

const args = ['--yes', 'cspell@v8', 'lint', '--no-progress', '--config', '.cspell.json']
const globs = ['src/**/*.ts', 'src/**/*.tsx', 'tailwind.config.js', 'postcss.config.js']
const cmd = `npx ${[...args, ...globs].join(' ')}`

let output = ''
try {
  output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
} catch (e) {
  // cspell exits non-zero when it finds problems, capturing its stdout either way
  output = (e.stdout && e.stdout.toString()) || ''
}

// Parse every "Unknown word (token)" line.
const lines = output.split(/\r?\n/)
const flagged = new Set()
for (const line of lines) {
  const m = line.match(/Unknown word \((.+)\)\s*$/)
  if (m) flagged.add(m[1])
}

let before = 0
if (fs.existsSync('cspell-words.txt')) {
  before = fs.readFileSync('cspell-words.txt', 'utf8').split(/\r?\n/).filter(Boolean).length
}
const existing = new Set(
  fs.existsSync('cspell-words.txt')
    ? fs.readFileSync('cspell-words.txt', 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    : []
)
let added = 0
for (const tok of flagged) {
  if (existing.has(tok)) continue
  existing.add(tok)
  added++
}
// Sort for stable diffs.
const sorted = [...existing].sort((a, b) => a.localeCompare(b, 'ar'))
fs.writeFileSync('cspell-words.txt', sorted.join('\n') + '\n', 'utf8')
console.log(`cspell flagged ${flagged.size} unique tokens, added ${added} new, total ${sorted.length} (was ${before})`)