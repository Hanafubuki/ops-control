// Claude Code's tree validator refuses an engine node that has a Box with one of these props
// anywhere above it, and then draws its own row instead of the mod's (the row logs "ui.render
// (ToolUse) refused: engine node under a Box with prop ..."). claude-code.d.ts does not list the
// rule. This list is what `$.ui.mount` enforced on 2.1.289, measured prop by prop in
// test/engine-tree.test.ts, which fails if the engine's answer and this list ever differ.
// Every other prop of `BoxProps` is accepted above an engine node.
export const REFUSED_ABOVE_ENGINE = ['width', 'height', 'minWidth', 'minHeight', 'overflow', 'display', 'position', 'top', 'left', 'right', 'bottom'] as const

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] } | string | null | undefined

// "<prop> on <Box path>" for every engine node that sits under a refused prop.
export function engineViolations(tree: unknown, path: string[] = [], refused: readonly string[] = []): string[] {
  const n = tree as Node
  if (!n || typeof n !== 'object') return []
  if (n.type === 'engine') return refused.map(p => `${p} above the engine node (${path.join('>') || 'root'})`)
  const here = n.type === 'Box' ? Object.keys(n.props ?? {}).filter(p => REFUSED_ABOVE_ENGINE.includes(p as never) && n.props![p] !== undefined) : []
  const next = [...refused, ...here.filter(p => !refused.includes(p))]
  return (n.children ?? []).flatMap(c => engineViolations(c, [...path, n.type ?? '?'], next))
}
