// JSX-free: rows.tsx and the docs gallery draw the same marks and tags.
export const SLAB_MARKS = { done: 'OK', fail: 'FAIL', stop: 'STOP', run: '…' }

export const MARKS = {
  cards: { done: '✓', fail: '✗', stop: '■', run: '…' },
  retro: { done: '[ OK ]', fail: '[FAIL]', stop: '[STOP]', run: '[....]' },
  slab: SLAB_MARKS,
}

// An MCP tool's name is mcp__server__tool; the last part is the one a reader knows.
export const slabTag = (tool: string): string => (tool.startsWith('mcp__') ? tool.split('__').at(-1)! : tool).toUpperCase().slice(0, 6).padEnd(6)

export const retroTag = (tool: string): string => `[${tool.toUpperCase().slice(0, 6).padEnd(6)}] `
