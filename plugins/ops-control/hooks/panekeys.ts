// The ops-control pane's keyboard map on top of the engine's. In a focused pane the engine moves the focus ring one
// element on ↑/↓ (its scroll keys fall back to that while the body has no rows of its own to scroll) and on Tab,
// and scrolls by a page on the keys bound to pane:pageUp/pageDown (← and → in keybindings.json). register.tsx
// turns those into: ←/→ the previous or next tab, ↑/↓ the previous or next control inside the tab, the tab strip
// above the first one, and a scroll of the tab's own window where there is no control to move to.
// Engine-free and JSX-free.

// The keys of the Buttons, Inputs and Selects in a drawn tree, in drawing order: the ring's stops.
export function focusablesOf(tree: unknown, els: Record<string, unknown>): string[] {
  const kinds = [els.Button, els.Input, els.Select].filter(k => k !== undefined)
  const out: string[] = []
  const walk = (n: unknown) => {
    if (Array.isArray(n)) { for (const c of n) walk(c); return }
    if (!n || typeof n !== 'object') return
    const node = n as { type?: unknown; props?: { key?: unknown; children?: unknown }; key?: unknown; children?: unknown }
    const key = node.props?.key ?? node.key
    if (node.type !== undefined && kinds.includes(node.type as {}) && typeof key === 'string') out.push(key)
    walk(node.children)
    walk(node.props?.children)
  }
  walk(tree)
  return out
}

// A ring move the engine is about to make, as a step: +1 or -1 when `to` is next to `from` (wrapping at the ends),
// undefined for anything else (a click lands anywhere).
export function stepOf(keys: readonly string[], from: string | undefined, to: string | undefined): 1 | -1 | undefined {
  if (!from || !to || from === to) return undefined
  const i = keys.indexOf(from), j = keys.indexOf(to), n = keys.length
  if (i < 0 || j < 0 || n < 2) return undefined
  if ((i + 1) % n === j) return 1
  if ((i - 1 + n) % n === j) return -1
  return undefined
}

export const isTabKey = (key: string | undefined) => !!key?.startsWith('tab-')

// Where a ↑ (-1) or ↓ (+1) from `from` goes inside the tab: `focus` the element to land on, else `stay` put, with
// `scroll` rows to move the tab's window by when there is nothing further to land on. `inside` narrows the stops
// (an open dropdown keeps the arrows on itself and its options).
export function steer(keys: readonly string[], from: string, step: 1 | -1, tab: string, inside?: (key: string) => boolean): { focus?: string; scroll?: number } {
  const stops = keys.filter(k => (inside ? inside(k) : !isTabKey(k)))
  if (isTabKey(from)) return step > 0 ? (stops[0] ? { focus: stops[0] } : { scroll: 1 }) : { scroll: -1 }
  const at = stops.indexOf(from)
  if (step > 0) return at >= 0 && at + 1 < stops.length ? { focus: stops[at + 1] } : at < 0 && stops[0] ? { focus: stops[0] } : { scroll: 1 }
  if (at > 0) return { focus: stops[at - 1] }
  // above the first control: the tab strip, unless a dropdown holds the arrows
  return inside ? {} : { focus: `tab-${tab}` }
}

// The tab a ← (-1) or → (+1) moves to, wrapping at the ends.
export function tabStep<T extends string>(tabs: readonly T[], current: T, step: 1 | -1): T | undefined {
  const i = tabs.indexOf(current)
  if (i < 0 || !tabs.length) return tabs[0]
  return tabs[(i + step + tabs.length) % tabs.length]
}
