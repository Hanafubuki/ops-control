// The Guardrails tab's rows: each source file with its rules, then the defaults Ops Control can enforce, every one
// that can change anything behind an on/off switch. pane.tsx boxes them and makes the switch rows pressable. JSX-free.
import type { Theme } from './themes.ts'
import { fit, type Seg } from './layout.tsx'
import { wrapSegs } from './mdrows.ts'
import { NO_SWITCHES, STATE_WORD, ruleId, switchable, type GuardSwitches, type Guardrails } from './guardrails.ts'

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

// The switch a row starts with, and the id register.tsx's onGuard toggles: `d:<label>` for a default, `r:<ruleId>`
// for a project rule.
export const switchKey = (isDefault: boolean, id: string) => (isDefault ? 'd:' : 'r:') + id
const mark = (on: boolean, t: Theme): Seg => ({ text: on ? '● on  ' : '○ off ', color: on ? t.colors.pass : t.colors.dim, bold: on })

export function guardrailRows(g: Guardrails | undefined, t: Theme, iw: number, lead: string, sw: GuardSwitches = NO_SWITCHES): { body: Seg[][]; right: string; switches: [number, string][] } {
  const c = t.colors, body: Seg[][] = [], switches: [number, string][] = [], indent: Seg[] = lead ? [{ text: lead, color: c.text }] : []
  const dim = (s: string): Seg[] => fit([{ text: lead + s, color: c.dim }], iw)
  if (!g) return { body: [dim('Reading the project…')], right: '', switches }
  const n = g.files.reduce((k, f) => k + f.rules.length, 0)
  if (g.files.length) {
    body.push(fit([...indent, { text: 'Project rules', color: c.accent, bold: true }, { text: '  off: Claude is told to disregard it', color: c.dim }], iw))
    g.files.forEach(f => {
      body.push([], fit([...indent, { text: f.path, color: c.text, bold: true }, { text: `  ${f.rules.length}`, color: c.dim }], iw))
      for (const r of f.rules) {
        const id = ruleId(f.path, r.text), on = !sw.off.includes(id)
        switches.push([body.length, switchKey(false, id)])
        body.push(...wrapSegs(on ? ruleSegs(r.text, r.strong, t) : [{ text: r.text, color: c.dim }], iw, [...indent, mark(on, t), { text: r.strong ? '■ ' : '□ ', color: r.strong && on ? c.fail : c.dim }]))
      }
    })
    body.push([])
  } else {
    body.push(...wrapSegs([{ text: 'No rules in this project (CLAUDE.md, AGENTS.md, .claude/rules, skills, agent rules).', color: c.dim }], iw, indent), [])
  }
  const defaults = g.defaults ?? []
  body.push(fit([...indent, { text: 'Ops Control guardrails', color: c.accent, bold: true }, { text: '  on: enforced', color: c.dim }], iw))
  const width = Math.max(0, ...defaults.map(d => d.label.length)) + 2
  for (const d of defaults) {
    const color = d.state === 'deny' ? c.fail : d.state === 'ask' ? c.edit : c.dim
    if (switchable(d)) {
      const on = sw.on.includes(d.label)
      switches.push([body.length, switchKey(true, d.label)])
      body.push(fit([...indent, mark(on, t), { text: d.label.padEnd(width), color: on ? c.text : c.dim, bold: on }, { text: STATE_WORD[d.state], color: on ? color : c.dim, bold: on }], iw))
    } else {
      body.push(fit([...indent, { text: '      ', color: c.dim }, { text: d.label.padEnd(width), color: c.dim }, { text: STATE_WORD[d.state], color: c.dim }], iw))
    }
    body.push(...wrapSegs([{ text: d.about, color: c.dim }], iw, [...indent, { text: '        ', color: c.text }]))
  }
  body.push([], ...wrapSegs([{ text: 'Enter (or a click) on a rule switches it; the choice is kept for this project.', color: c.dim }], iw, indent))
  const enforced = defaults.filter(d => switchable(d) && sw.on.includes(d.label)).length, off = sw.off.length
  return { body, right: `${n} rule${n === 1 ? '' : 's'}${off ? ` (${off} off)` : ''} · ${enforced} enforced`, switches }
}
