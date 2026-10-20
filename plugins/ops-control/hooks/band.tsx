import type { Model } from './model.ts'
import { bandVisible, normalizeModel, planFold } from './model.ts'
import type { Theme } from './themes.ts'
import type { Look } from './packs.ts'
import { comboSegs, fit, hearts, hpBar, renderSegs, toneColor, visibleLength, type Seg, type Tier } from './layout.tsx'

import type { BandItem } from './setup.ts'
import { DEFAULT_SETUP } from './setup.ts'
import { workBarRows, type WorkInput } from './workbar.ts'

// The pet is never drawn here: it lives at the bottom of the ops-control pane.
export type BandExtra = { look?: Look; friday?: boolean; band?: readonly BandItem[] }

export function bandSegments(model: Model, base: Theme, columns: number, extra?: BandExtra): Seg[] {
  const m = normalizeModel(model)
  const t = extra?.look?.theme ?? base
  const c = t.colors
  const band = extra?.band ?? DEFAULT_SETUP.band
  // combo rides on the activity label, which is the part that shrinks; its place in the list only switches it on
  const head: Seg[] = [{ text: `${m.act.glyph} ${m.act.label}`, color: toneColor(t, m.act.tone), bold: true }, ...(band.includes('combo') ? comboSegs(m.combo, extra?.look) : [])]
  const tail: Seg[] = []
  const sep = (): Seg => ({ text: '  ·  ', color: c.dim })
  for (const item of band) {
    if (item === 'agents') {
      const live = m.agents.filter(a => a.state === 'running').length
      if (live) tail.push(sep(), { text: `◆ ${live} subagent${live === 1 ? '' : 's'}`, color: c.agent })
    } else if (item === 'meter') {
      // the life bar needs room for its words; a narrow band keeps the hearts
      tail.push(sep(), ...(extra?.look?.extras.hp && columns >= 80 ? hpBar(m.ctxPercent, t, Math.min(34, Math.floor(columns * 0.3))) : hearts(m.ctxPercent, t)))
    } else if (item === 'plan' && m.plan.length && planFold(m) === undefined) {
      const done = m.plan.filter(p => p.status === 'completed').length
      tail.push(sep(), { text: '◇ ', color: c.dim }, { text: '●'.repeat(done) + '○'.repeat(m.plan.length - done), color: c.accent })
    }
  }
  // the action may shrink; the tail stays whole until even it doesn't fit
  const tailLen = visibleLength(tail)
  if (tailLen + 8 > columns) return fit(head, columns)
  return [...fit(head, columns - tailLen), ...tail]
}

export function renderBand(els: { Box: any; Text: any }, model: Model, t: Theme, columns: number, tier: Tier, now: number, extra?: BandExtra) {
  const m = normalizeModel(model)
  if (tier === 'wide' || !bandVisible(m, now)) return null
  return renderSegs(els, bandSegments(m, t, columns, extra), 'band')
}

// The work bar's two rows (workbar.ts), drawn in place of the band while the setup's bar is `work`.
export function renderWorkBar(els: { Box: any; Text: any }, t: Theme, w: WorkInput) {
  const { Box } = els
  const [rule, head, instruments] = workBarRows(t, w)
  return <Box flexDirection="column">{renderSegs(els, rule, 'work-rule')}{renderSegs(els, head, 'work-head')}{renderSegs(els, instruments, 'work-instruments')}</Box>
}
