// Turns are numbered in the order their prompts are first drawn, which is transcript order. A
// prompt first draws under the id "placeholder" until it is stored: it shows the number the stored
// row will take, but neither claims it nor is kept. Claude Code redraws old rows on every
// invalidate, so a tool keeps the number it first drew with.
export function makeTurns() {
  const turnByMessage = new Map<string, number>()
  const seqByTool = new Map<string, number>()
  let turn = 0, inTurn = 0
  return {
    turnFor(messageId: string): number {
      if (messageId === 'placeholder') return turnByMessage.size + 1
      if (!turnByMessage.has(messageId)) turnByMessage.set(messageId, turnByMessage.size + 1)
      return turnByMessage.get(messageId)!
    },
    toolSeq(toolId: string): number {
      if (turnByMessage.size !== turn) { turn = turnByMessage.size; inTurn = 0 }
      if (!seqByTool.has(toolId)) seqByTool.set(toolId, ++inTurn)
      return seqByTool.get(toolId)!
    },
  }
}
