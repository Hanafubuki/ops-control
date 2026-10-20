import { expect } from 'claude-code/testing'
import { runOpsControl, test } from './kit.ts'
import { BUS, DEST, LINUX_BUS, boot, mountPane, mountPlayer, ok, start, text, walk } from './spotify-kit.ts'

const PLAYING = ['{"type":"s","data":"Playing"}', '{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/t"},"xesam:title":{"type":"s","data":"Song"},"mpris:length":{"type":"t","data":9000000},"xesam:url":{"type":"s","data":"https://open.spotify.com/track/t"}}}', '{"type":"x","data":1000000}'].join('\n')
// A test's $ cannot raise the person's Esc, so the dialog closes the way a plugin may: the command, which toggles it.
const closeDialog = async ($: any) => expect((await runOpsControl($, 'music')).text).toBe('Music player closed')

test('/ops music opens the focused dialog and leaves the ops-control pane alone', async ($, on) => {
  const s = boot(on, { runs: { ...LINUX_BUS, [BUS]: ok(PLAYING) } })
  await start($, on)
  s.panes.push({ id: 'ops-control', isShown: true, isFocused: false, isPlaced: true })
  const out = await runOpsControl($, 'music')
  expect(out.text).toBe('Music player open (Esc closes it)')
  expect(s.opens.map(o => o.id)).toEqual(['ops-control-music'])
  expect(s.opens[0]).toMatchObject({ focus: true, closeOnEscape: true, holdToasts: true, rows: 24, columns: 110, title: 'Music' })
  expect(s.closes).toEqual([])
  await closeDialog($)
  expect(s.opens.map(o => o.id)).toEqual(['ops-control-music'])
})

test('Player from the pane closes it and the dialog close reopens it with the keys', async ($, on) => {
  const s = boot(on, { runs: { ...LINUX_BUS, [BUS]: ok(PLAYING) } })
  const clock = await start($, on)
  s.panes.push({ id: 'ops-control', isShown: true, isFocused: true, isPlaced: true })
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  await clock.advance(50)
  await pane.press({ key: 'music-player' })
  expect(s.closes.map(c => c.id)).toEqual(['ops-control'])
  expect(s.opens.map(o => o.id)).toEqual(['ops-control-music'])
  await closeDialog($)
  expect(s.opens.map(o => o.id)).toEqual(['ops-control-music', 'ops-control'])
  expect(s.opens[1].focus).toBe(true)
  // a second close of the dialog does not reopen the pane again
  await runOpsControl($, 'music')
  await closeDialog($)
  expect(s.opens.map(o => o.id)).toEqual(['ops-control-music', 'ops-control', 'ops-control-music'])
  await pane.unmount()
})

test('the dialog draws the track and its Clients, and a press reaches Spotify', async ($, on) => {
  const NEXT = `busctl --user call ${DEST} Next`
  const s = boot(on, { runs: { ...LINUX_BUS, [BUS]: ok(PLAYING), [NEXT]: ok() } })
  const clock = await start($, on)
  await runOpsControl($, 'music')
  await clock.advance(50)
  const ui = await mountPlayer($)
  const tree = await ui.drawn()
  expect(text(tree)).toContain('Song')
  const seek = walk(tree).find(n => n?.type === 'Client' && n.props?.key === 'ops-control-seek')
  expect(seek.props.props).toMatchObject({ kind: 'progress', durationMs: 9000, playing: true })
  // Linux: Spotify ignores Volume writes, so no volume Client
  expect(walk(tree).some(n => n?.props?.key === 'ops-control-volume')).toBe(false)
  await ui.press({ key: 'music-next' })
  await clock.advance(50)
  expect(s.ran).toContain(NEXT)
  await ui.unmount()
})

test('a refused copy says why inside the dialog', async ($, on) => {
  const copy = { value: { isCopied: false, reason: 'no clipboard on this surface' } as unknown }
  const s = boot(on, { runs: { ...LINUX_BUS, [BUS]: ok(PLAYING) }, copy })
  const clock = await start($, on)
  await runOpsControl($, 'music')
  await clock.advance(50)
  const ui = await mountPlayer($)
  await ui.press({ key: 'music-copy' })
  expect(s.copies).toEqual(['https://open.spotify.com/track/t'])
  expect(await ui.find({ text: /Could not copy the link: no clipboard on this surface/ })).toBeDefined()
  copy.value = new Error('clipboard busy')
  await ui.press({ key: 'music-copy' })
  // the engine skips a hook that throws, so the reason is its own wording, not the message
  expect(await ui.find({ text: /Could not copy the link: \S/ })).toBeDefined()
  expect(await ui.find({ text: /no clipboard on this surface/ })).toBeUndefined()
  copy.value = { isCopied: true }
  await ui.press({ key: 'music-copy' })
  expect(await ui.find({ text: /Link copied\./ })).toBeDefined()
  expect(s.toasts).toEqual([])
  await ui.unmount()
})

test('while the dialog shows, Spotify is read every second and its cover is fetched at 20', async ($, on) => {
  const ART = '/gi spotify-art --size 20 https://i.scdn.co/image/ab67616d00004851d1'
  const WITH_ART = PLAYING.replace('"xesam:url"', '"mpris:artUrl":{"type":"s","data":"https://i.scdn.co/image/ab67616d0000b273d1"},"xesam:url"')
  const s = boot(on, { runs: { ...LINUX_BUS, [BUS]: ok(WITH_ART) } })
  const clock = await start($, on)
  await runOpsControl($, 'music')
  const ui = await mountPlayer($, 24)
  await clock.advance(50)
  const before = s.ran.filter(a => a === BUS).length
  for (let i = 0; i < 6; i++) await clock.advance(1000)
  expect(s.ran.filter(a => a === BUS).length - before).toBeGreaterThanOrEqual(5)
  expect(s.ran).toContain(ART)
  await ui.unmount()
})

test('a paused track\'s cover is fetched at the dialog size on its first draw', async ($, on) => {
  const ART = '/gi spotify-art --size 20 https://i.scdn.co/image/ab67616d00004851d1'
  const PAUSED = PLAYING.replace('"Playing"', '"Paused"').replace('"xesam:url"', '"mpris:artUrl":{"type":"s","data":"https://i.scdn.co/image/ab67616d0000b273d1"},"xesam:url"')
  const s = boot(on, { runs: { ...LINUX_BUS, [BUS]: ok(PAUSED) } })
  const clock = await start($, on)
  await runOpsControl($, 'music')
  const ui = await mountPlayer($, 24)
  await ui.drawn()
  await clock.advance(50)
  expect(s.ran).toContain(ART)
  await ui.unmount()
})

test('a dialog that fails to open leaves the ops-control pane open and focused', async ($, on) => {
  const s = boot(on, { runs: { ...LINUX_BUS, [BUS]: ok(PLAYING) } })
  s.failOpen = 'ops-control-music'
  const clock = await start($, on)
  s.panes.push({ id: 'ops-control', isShown: true, isFocused: true, isPlaced: true })
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  await clock.advance(50)
  await pane.press({ key: 'music-player' })
  await clock.advance(50)
  expect(s.closes.map(c => c.id)).toEqual(['ops-control'])
  expect(s.opens.at(-1)).toMatchObject({ id: 'ops-control', focus: true })
  await pane.unmount()
})
