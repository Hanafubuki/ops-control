import { test, expect } from 'claude-code/testing'
import { DEFAULT_RULES, isSource, readGuardrails, rulesIn } from '../hooks/guardrails.ts'
import { guardrailRows } from '../hooks/guardrailstab.ts'
import { tabRows } from '../hooks/pane.tsx'
import { initialModel } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme
const text = (rows: { text: string }[][]) => rows.map(r => r.map(s => s.text).join(''))

test('a rule is a list item under a rules heading, or a line that says must, never, always', () => {
  const rules = rulesIn([
    '---', 'name: deploy', 'description: You must not read this', '---',
    '# Project', 'This repo builds the API.', 'You must run the tests before committing.',
    '## Guardrails', '- Keep secrets out of logs', '- [ ] Ask before touching prod', '',
    '## Notes', '- The build takes a minute', '- Never push to main directly.', '- Prefer small commits',
    '```', 'never parsed: code', '```', '| never | a table |',
  ].join('\n'))
  expect(rules.map(r => [r.text, r.strong])).toEqual([
    ['You must run the tests before committing.', true],
    ['Keep secrets out of logs', false],
    ['Ask before touching prod', false],
    ['Never push to main directly.', true],
    ['Prefer small commits', false],
  ])
})

const host = (files: Record<string, string>) => ({
  exists: async (p: string) => p in files || Object.keys(files).some(f => f.startsWith(p + '/')),
  listDir: async (p: string) => [...new Set(Object.keys(files).filter(f => f.startsWith(p + '/')).map(f => f.slice(p.length + 1).split('/')[0]!))],
  readFile: async (p: string) => { if (!(p in files)) throw new Error('ENOENT'); return files[p]! },
})

test('the project\'s rule files are read in order: CLAUDE.md, rule folders, skills; none gives the defaults', async () => {
  const g = await readGuardrails(host({
    '/p/CLAUDE.md': '- Always use pnpm.',
    '/p/.claude/rules/git.md': '# Rules\n- No force pushes',
    '/p/.claude/skills/deploy/SKILL.md': 'Never deploy on a Friday.',
    '/p/.claude/skills/empty/SKILL.md': 'Just notes here.',
    '/p/agent_rules/style.md': '- You should keep functions short',
    '/p/README.md': 'You must read me.',
  }), '/p/', 5)
  expect(g.files.map(f => [f.path, f.rules.length])).toEqual([['CLAUDE.md', 1], ['.claude/rules/git.md', 1], ['.claude/skills/deploy/SKILL.md', 1], ['agent_rules/style.md', 1]])
  expect(g.defaults).toBeUndefined()
  const none = await readGuardrails(host({ '/p/README.md': 'hi' }), '/p', 5)
  expect(none).toEqual({ files: [], defaults: [...DEFAULT_RULES], readAt: 5 })
  expect(DEFAULT_RULES.find(d => d.label === 'Force push & resets')?.state).toBe('deny')
  expect(isSource('/p/.claude/rules/new.md', '/p')).toBe(true)
  expect(isSource('/p/CLAUDE.md', '/p')).toBe(true)
  expect(isSource('/p/src/CLAUDE.md', '/p')).toBe(false)
})

test('the tab boxes each file with its rules, or the defaults with what each would do', async () => {
  const g = await readGuardrails(host({ '/p/AGENTS.md': '- Never commit .env files' }), '/p', 0)
  const rows = text(tabRows(initialModel(), T, { tab: 'guardrails', guardrails: g }, 60, false, 0))
  expect(rows[0]).toMatch(/^╭─ GUARDRAILS ─+ 1 rule · 1 file ─╮$/)
  expect(rows.some(r => r.includes('AGENTS.md'))).toBe(true)
  expect(rows.some(r => r.includes('■ Never commit .env files'))).toBe(true)
  const defaults = text(tabRows(initialModel(), T, { tab: 'guardrails', guardrails: { files: [], defaults: [...DEFAULT_RULES], readAt: 0 } }, 60, false, 0))
  expect(defaults[0]).toMatch(/GUARDRAILS ─+ defaults ─╮$/)
  expect(defaults.some(r => /Force push & resets\s+Never/.test(r))).toBe(true)
  expect(defaults.some(r => r.includes('Shown, not enforced.'))).toBe(true)
  expect(text(guardrailRows(undefined, T, 50, '').body)).toEqual(['Reading the project…'])
})
