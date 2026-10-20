// The box around one reply: a message that opens a reply, and every tool row, result and group after it until the next
// one. Only the rows between boxes draw edges: a prompt draws the bottom edge of the box before it and the top edge of
// the one after it, a message opening a reply draws both over its own top, the turn's duration line draws the bottom,
// and while a turn runs the spinner draws the bottom of the box still open. The rows inside draw the sides alone, since
// Claude Code folds a tool row into a group row after it drew, and a row never learns that it was the last one.
//
// A turn's final answer is no box: it keeps the double rule and its Conclusion title, and the rows after it (a hook's
// notice) sit outside any box. It is only known once the turn ended, when every row draws again, so which box a row
// belongs to is fixed when it first draws and its edges are worked out on every draw, asking `isFinalText` afresh.
//
// Rows first draw in transcript order, but for one: Claude Code makes the row of a folded run of calls ("Ran 2
// commands") later, even after the next prompt. Calls are noted as they are made (noteCall), and such a row joins the
// box its first call was made in.

// closes: draws the bottom edge of the box before it first; opens: draws the top edge over its own first line;
// opensAfter: draws the top edge of the next box under itself; inside: draws the sides
export type FramePlace = { closes: boolean; opens: boolean; opensAfter: boolean; inside: boolean }

type Row =
  | { kind: 'prompt'; closesBox?: number; opensBox?: number }
  | { kind: 'opener'; box: number; closesBox?: number; startedBox: boolean; text: string }
  | { kind: 'member'; box?: number }
  | { kind: 'closer'; closesBox?: number }

const place = (fields: Partial<FramePlace>): FramePlace => ({ closes: false, opens: false, opensAfter: false, inside: false, ...fields })

export function makeFrames(isFinalText: (text: string) => boolean) {
  const rows = new Map<string, Row>()
  const rowsByBox = new Map<number, string[]>()
  const boxByCall = new Map<string, number | undefined>()
  let openBox: number | undefined
  let lastBox = 0
  const newBox = () => { rowsByBox.set(++lastBox, []); return lastBox }
  const join = (box: number | undefined, rowKey: string) => { if (box !== undefined) rowsByBox.get(box)!.push(rowKey) }
  const isConclusion = (rowKey: string) => {
    const row = rows.get(rowKey)
    return row?.kind === 'opener' && isFinalText(row.text)
  }
  const isConclusionBox = (box: number) => isConclusion(rowsByBox.get(box)?.[0] ?? '')
  // a box that is drawn: it holds rows, and no final answer opened it
  const isDrawn = (box: number | undefined) => box !== undefined && !!rowsByBox.get(box)?.length && !isConclusionBox(box)
  const remember = <T extends Row>(rowKey: string, row: T): T => { rows.set(rowKey, row); return row }

  function edgesOf(rowKey: string, row: Row): FramePlace {
    switch (row.kind) {
      case 'prompt': return place({ closes: isDrawn(row.closesBox), opensAfter: row.opensBox !== undefined && !isConclusionBox(row.opensBox) })
      case 'opener':
        if (isConclusion(rowKey)) return place({ closes: isDrawn(row.closesBox) })
        return place({ closes: isDrawn(row.closesBox), opens: row.startedBox, inside: true })
      case 'member': return place({ inside: row.box !== undefined && !isConclusionBox(row.box) })
      case 'closer': return place({ closes: isDrawn(row.closesBox) })
    }
  }

  return {
    // whether a box is open for the spinner to close while the turn runs
    isOpen: () => openBox !== undefined && !isConclusionBox(openBox),
    // A tool call as it is made: the box its rows belong in, wherever they draw.
    noteCall(toolUseId: string) {
      if (!boxByCall.has(toolUseId)) boxByCall.set(toolUseId, openBox)
    },
    // A message that opens a reply, with its text: ends the box before it and opens its own, or is the first row of
    // the box a prompt opened.
    opener(rowKey: string, text: string): FramePlace {
      const row = rows.get(rowKey) ?? (() => {
        const intoEmpty = openBox !== undefined && !rowsByBox.get(openBox)!.length
        const opened = intoEmpty ? { box: openBox!, startedBox: false } : { box: newBox(), closesBox: openBox, startedBox: true }
        openBox = opened.box
        join(opened.box, rowKey)
        return remember(rowKey, { kind: 'opener' as const, ...opened, text })
      })()
      return edgesOf(rowKey, row)
    },
    // A tool row, result, group, notice or a later block of the same reply: inside the box its first call was made in
    // (`callIds`, noted by noteCall), else the open box, if there is one.
    member(rowKey: string, callIds: readonly string[] = []): FramePlace {
      const row = rows.get(rowKey) ?? (() => {
        const callId = callIds.find(id => boxByCall.has(id))
        const box = callId !== undefined ? boxByCall.get(callId) : openBox
        join(box, rowKey)
        return remember(rowKey, { kind: 'member' as const, box })
      })()
      return edgesOf(rowKey, row)
    },
    // A prompt: ends the open box and opens the next one under itself, unless `opensNext` is false (a slash command,
    // whose output is no reply). `peek` answers without taking the place, for a prompt that draws as "placeholder"
    // before its stored row.
    prompt(rowKey: string, { opensNext = true, peek = false } = {}): FramePlace {
      const known = rows.get(rowKey)
      if (known) return edgesOf(rowKey, known)
      if (peek) return place({ closes: isDrawn(openBox), opensAfter: opensNext })
      const row = remember(rowKey, { kind: 'prompt' as const, closesBox: openBox, ...(opensNext && { opensBox: newBox() }) })
      openBox = row.opensBox
      return edgesOf(rowKey, row)
    },
    // The turn's duration line: ends the open box.
    closer(rowKey: string): FramePlace {
      const row = rows.get(rowKey) ?? (() => {
        const closing = remember(rowKey, { kind: 'closer' as const, closesBox: openBox })
        openBox = undefined
        return closing
      })()
      return edgesOf(rowKey, row)
    },
  }
}
