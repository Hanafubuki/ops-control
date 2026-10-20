// The Guardrails tab's rows: each source file with its rules, or the default set with what each one would do.
// pane.tsx boxes them. JSX-free.
import type { Theme } from './themes.ts'
import { fit, type Seg } from './layout.tsx'
import { wrapSegs } from './mdrows.ts'
import { STATE_WORD, type Guardrails } from './guardrails.ts'

// The words a rule turns on, drawn in the accent so a long rule still reads at a glance.
const KEY_WORDS = /\b(must not|must|never|always|do not|don'?t|should not|should|avoid|only|required|forbidden)\b/gi

function ruleSegs(text: string, strong: boolean, t: Theme): Seg[] {
  const c = t.colors, out: Seg[] = []
  let at = 0
  for (const m of text.matchAll(KEY_WORDS)) {
    if (m.index! > at) out.push({ text: text.slice(at, m.index), color: c.text })
    out.push({ text: m[0], color: strong ? c.fail : c.edit, bold: true })
    at = m.index! + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at), color: c.text })
  return out
}

export function guardrailRows(g: Guardrails | undefined, t: Theme, iw: number, lead: string): { body: Seg[][]; right: string } {
  const c = t.colors, body: Seg[][] = [], indent: Seg[] = lead ? [{ text: lead, color: c.text }] : []
  const dim = (s: string): Seg[] => fit([{ text: lead + s, color: c.dim }], iw)
  if (!g) return { body: [dim('Reading the project…')], right: '' }
  if (g.files.length) {
    const n = g.files.reduce((k, f) => k + f.rules.length, 0)
    g.files.forEach((f, i) => {
      if (i) body.push([])
      body.push(fit([...indent, { text: f.path, color: c.accent, bold: true }, { text: `  ${f.rules.length}`, color: c.dim }], iw))
      for (const r of f.rules) body.push(...wrapSegs(ruleSegs(r.text, r.strong, t), iw, [...indent, { text: r.strong ? '■ ' : '□ ', color: r.strong ? c.fail : c.dim }]))
    })
    body.push([], dim('Read from the project. ops-control shows them; it enforces none.'))
    return { body, right: `${n} rule${n === 1 ? '' : 's'} · ${g.files.length} file${g.files.length === 1 ? '' : 's'}` }
  }
  body.push(...wrapSegs([{ text: 'No guardrails in this project (CLAUDE.md, AGENTS.md, .claude/rules, skills, agent rules). The defaults:', color: c.dim }], iw, indent), [])
  const width = Math.max(...(g.defaults ?? []).map(d => d.label.length)) + 2
  for (const d of g.defaults ?? []) {
    const color = d.state === 'deny' ? c.fail : d.state === 'ask' ? c.edit : c.dim
    body.push(fit([...indent, { text: d.label.padEnd(width), color: c.text, bold: d.state !== 'default' }, { text: STATE_WORD[d.state], color, bold: d.state !== 'default' }], iw))
    body.push(...wrapSegs([{ text: d.about, color: c.dim }], iw, [...indent, { text: '  ', color: c.text }]))
  }
  body.push([], ...wrapSegs([{ text: 'Shown, not enforced. Add a GUARDRAILS.md or .claude/rules/*.md to the project and its rules show here instead.', color: c.dim }], iw, indent))
  return { body, right: 'defaults' }
}
