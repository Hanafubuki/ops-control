import { test, expect } from 'claude-code/testing'
import { takeOver, restore, ensureRefresh, statusText, writeStatusFile, script } from '../hooks/statusline.ts'
import { BREAK } from '../hooks/fields.ts'
import { initialModel } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'
import { fakeHost } from './kit.ts'

const SETTINGS = '/home/u/.claude/settings.json'
const SCRIPT = '/home/u/.claude/ops-control/statusline.sh'
const yes = async () => true

test('the success message repeats the project override warning', async () => {
  const withProject = fakeHost({ files: { [SETTINGS]: '{}' }, projectStatusLine: true })
  expect(await takeOver(withProject.host, yes)).toContain('project')
  const plain = fakeHost({ files: { [SETTINGS]: '{}' } })
  expect(await takeOver(plain.host, yes)).not.toContain('project')
})

test('a non-string saved command does not leak into the script', async () => {
  const { host, files } = fakeHost({ files: { [SETTINGS]: '{"statusLine":{"type":"command","command":{"a":1}}}' } })
  await takeOver(host, yes)
  expect(files[SCRIPT]).not.toContain('object Object')
  expect(files[SCRIPT]).toContain('exit 0')
})

test('a single quote in the original command is escaped in the script', async () => {
  const { host, files } = fakeHost({ files: { [SETTINGS]: `{"statusLine":{"type":"command","command":"echo 'hi'"}}` } })
  await takeOver(host, yes)
  expect(files[SCRIPT]).toContain(`sh -c 'echo '\\''hi'\\'''`)
})

test('a config dir with a space, $ or quote is single-quoted in settings and the script', async () => {
  const dir = `/home/u/it's $HOME/.claude`
  const { host: base, files } = fakeHost({ files: { [`${dir}/settings.json`]: '{}' } })
  const host = { ...base, configDir: dir }
  await takeOver(host, yes)
  const q = `'/home/u/it'\\''s $HOME/.claude`
  expect(JSON.parse(files[`${dir}/settings.json`]!).statusLine.command).toBe(`sh ${q}/ops-control/statusline.sh'`)
  expect(files[`${dir}/ops-control/statusline.sh`]).toContain(`f=${q}/ops-control/status'/"$sid"`)
  // the quoted command no longer holds the raw path, and is still ours
  expect(await restore(host)).toBe('Your status line is back.')
  expect(JSON.parse(files[`${dir}/settings.json`]!)).toEqual({})
})

test('restore leaves a status line someone changed since, and forgets the backup', async () => {
  const { host, files, store, ran } = fakeHost({ files: { [SETTINGS]: '{"statusLine":{"type":"command","command":"mine"}}' } })
  await takeOver(host, yes)
  files[SETTINGS] = '{"statusLine":{"type":"command","command":"theirs"}}'
  expect(await restore(host)).toBe('Your status line was changed since; left it as is.')
  expect(JSON.parse(files[SETTINGS]!).statusLine.command).toBe('theirs')
  expect('statusline-backup' in store).toBe(false)
  expect(ran).toContain(`rm -rf /home/u/.claude/ops-control/status`)
})

test('takeover changes only statusLine and restore puts it back', async () => {
  const original = { model: 'opus', statusLine: { type: 'command', command: 'ccstatusline' }, hooks: { Stop: [] } }
  const { host, files, ran } = fakeHost({ files: { [SETTINGS]: JSON.stringify(original, null, 2) } })
  const msg = await takeOver(host, yes)
  expect(msg).toContain('restore')
  const after = JSON.parse(files[SETTINGS]!)
  expect(after.statusLine).toEqual({ type: 'command', command: `sh '${SCRIPT}'`, refreshInterval: 30 })
  expect({ ...after, statusLine: undefined }).toEqual({ ...original, statusLine: undefined })
  expect(files[SCRIPT]).toContain('ccstatusline')
  await restore(host)
  expect(JSON.parse(files[SETTINGS]!)).toEqual(original)
  expect(ran).toContain(`rm -f ${SCRIPT}`)
  expect(ran).toContain(`rm -rf /home/u/.claude/ops-control/status`)
})

test('restore removes the key when there was none before, and forgets the backup', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus"}' } })
  await takeOver(host, yes)
  await restore(host)
  expect(JSON.parse(files[SETTINGS]!)).toEqual({ model: 'opus' })
  expect('statusline-backup' in store).toBe(false)
  expect(await restore(host)).toContain('Nothing to restore')
})

test('takeover twice keeps the first backup', async () => {
  const { host, files } = fakeHost({ files: { [SETTINGS]: '{"statusLine":{"type":"command","command":"mine"}}' } })
  await takeOver(host, yes)
  await takeOver(host, yes)
  await restore(host)
  expect(JSON.parse(files[SETTINGS]!).statusLine.command).toBe('mine')
})

test('unreadable settings refuse the takeover and touch nothing', async () => {
  const { host, files } = fakeHost({ files: { [SETTINGS]: '{ not json' } })
  expect(await takeOver(host, yes)).toContain('could not read')
  expect(files[SETTINGS]).toBe('{ not json')
})

test('declining the question changes nothing', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus"}' } })
  const asked: string[] = []
  const msg = await takeOver(host, async q => { asked.push(q); return false })
  expect(asked.length).toBe(1)
  expect(msg).toContain('unchanged')
  expect(files[SETTINGS]).toBe('{"model":"opus"}')
  expect(SCRIPT in files).toBe(false)
  expect('statusline-backup' in store).toBe(false)
})

test('the question warns when a project statusLine overrides the user one', async () => {
  const withProject = fakeHost({ files: { [SETTINGS]: '{}' }, projectStatusLine: true })
  let q = ''
  await takeOver(withProject.host, async s => { q = s; return false })
  expect(q).toContain('project')
  const plain = fakeHost({ files: { [SETTINGS]: '{}' } })
  await takeOver(plain.host, async s => { q = s; return false })
  expect(q).not.toContain('project')
})

test('accepting the question takes over', async () => {
  const { host, files } = fakeHost({ files: { [SETTINGS]: '{}' } })
  await takeOver(host, async () => true)
  expect(JSON.parse(files[SETTINGS]!).statusLine.command).toBe(`sh '${SCRIPT}'`)
})

test('status text', async () => {
  const T = resolveTheme('classic', {}).theme
  expect(statusText(initialModel(), T)).toBe('◆ idle')
  expect(statusText({ ...initialModel(), working: true, ctxPercent: 48, act: { glyph: '✎', label: 'Editing a.ts', tone: 'edit' } }, T)).toBe('◆ editing · ctx 48%')
})

test('status word comes from the glyph, not the label', async () => {
  const T = resolveTheme('classic', {}).theme
  const line = (glyph: string) =>
    statusText({ ...initialModel(), working: true, ctxPercent: 1, act: { glyph, label: 'Frobnicating', tone: 'text' } }, T)
  const cases: Record<string, string> = { '▸': 'reading', '⌕': 'searching', '✎': 'editing', $: 'running', '◆': 'delegating', '✗': 'failing', '✓': 'passing', '!': 'waiting', '✻': 'thinking', '·': 'thinking' }
  for (const [g, w] of Object.entries(cases)) expect(line(g)).toBe(`◆ ${w} · ctx 1%`)
  expect(statusText({ ...initialModel(), ctxPercent: 5 }, T)).toBe('◆ idle · ctx 5%')
})

test('status says delegating while subagents run after the main turn', async () => {
  const T = resolveTheme('classic', {}).theme
  const agent = { key: 'a1', name: 'scout', task: '', state: 'running' as const, startedAt: 0 }
  expect(statusText({ ...initialModel(), agents: [agent] }, T)).toBe('◆ delegating')
  expect(statusText({ ...initialModel(), ctxPercent: 3, agents: [{ ...agent, state: 'done' }] }, T)).toBe('◆ idle · ctx 3%')
})

test('status text takes a field list and a color mode', async () => {
  const T = resolveTheme('classic', {}).theme
  const m = { ...initialModel(), ctxPercent: 5, branch: 'main' }
  expect(statusText(m, T, { fields: ['branch', 'ctx'] })).toBe('main · ctx 5%')
  expect(statusText(m, T, { color: 'truecolor' })).toContain('\x1b[38;2;')
})

test('the status line is written to the session file', async () => {
  const { host, files } = fakeHost()
  await writeStatusFile(host, 's1', '◆ idle · ctx 5%')
  expect(files['/home/u/.claude/ops-control/status/s1']).toBe('◆ idle · ctx 5%')
})

const OURS = `{"statusLine":{"type":"command","command":"sh '${SCRIPT}'"}}`

test('a status line that is already ops-control is never saved as the backup', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: OURS } })
  let asked = 0
  expect(await takeOver(host, async () => { asked++; return true })).toContain('already')
  expect(asked).toBe(0)
  expect('statusline-backup' in store).toBe(false)
  expect(JSON.parse(files[SETTINGS]!).statusLine.refreshInterval).toBe(30)
  expect(SCRIPT in files).toBe(false)
})

test('a script already on disk that calls itself is rewritten with no fallback', async () => {
  const bad = `#!/bin/sh\nprintf '%s' "$input" | sh -c 'sh '\\''${SCRIPT}'\\'''\n`
  const { host, files } = fakeHost({ files: { [SETTINGS]: OURS, [SCRIPT]: bad } })
  await takeOver(host, yes)
  expect(files[SCRIPT]).not.toContain('sh -c')
  expect(files[SCRIPT]).toContain('exit 0')
})

test('a stored backup that is ops-control own command never reaches the script', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{}' } })
  store['statusline-backup'] = { type: 'command', command: `sh '${SCRIPT}'` }
  await takeOver(host, yes)
  expect(files[SCRIPT]).not.toContain('sh -c')
})

test('script refuses a fallback that names ops-control own script or status dir', async () => {
  for (const original of [`sh '${SCRIPT}'`, `cat /home/u/.claude/ops-control/status/x`]) {
    const out = script('/home/u/.claude', original)
    expect(out).not.toContain('sh -c')
    expect(out).toContain('exit 0')
  }
  expect(script('/home/u/.claude', 'ccstatusline')).toContain(`sh -c 'ccstatusline'`)
})

test('the script exits at once when it is already running inside itself', async () => {
  const lines = script('/home/u/.claude', 'ccstatusline').split('\n')
  expect(lines[0]).toBe('#!/bin/sh')
  expect(lines[1]).toBe('[ -n "$OPS_CONTROL_STATUSLINE" ] && exit 0; OPS_CONTROL_STATUSLINE=1; export OPS_CONTROL_STATUSLINE')
})

test('restore treats a backup that is ops-control own command as no previous line', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus",' + OURS.slice(1) } })
  store['statusline-backup'] = { type: 'command', command: `sh '${SCRIPT}'` }
  await restore(host)
  expect(JSON.parse(files[SETTINGS]!)).toEqual({ model: 'opus' })
})

test('an existing ops-control status line gains refreshInterval; one the person set stays', async () => {
  const { host, files } = fakeHost({ files: { [SETTINGS]: JSON.stringify({ model: 'opus', statusLine: { type: 'command', command: `sh '${SCRIPT}'` } }) } })
  await ensureRefresh(host)
  expect(JSON.parse(files[SETTINGS]!)).toEqual({ model: 'opus', statusLine: { type: 'command', command: `sh '${SCRIPT}'`, refreshInterval: 30 } })
  const mine = JSON.stringify({ statusLine: { type: 'command', command: `sh '${SCRIPT}'`, refreshInterval: 5 } })
  files[SETTINGS] = mine
  await ensureRefresh(host)
  expect(files[SETTINGS]).toBe(mine)
})

test('ensureRefresh leaves a status line that is not ops-control alone', async () => {
  const theirs = '{"statusLine":{"type":"command","command":"ccstatusline"}}'
  const { host, files } = fakeHost({ files: { [SETTINGS]: theirs } })
  await ensureRefresh(host)
  expect(files[SETTINGS]).toBe(theirs)
})

test('restore after a takeover brings back the backed-up line with no refreshInterval', async () => {
  const original = { statusLine: { type: 'command', command: 'ccstatusline', padding: 1 } }
  const { host, files } = fakeHost({ files: { [SETTINGS]: JSON.stringify(original) } })
  await takeOver(host, yes)
  await ensureRefresh(host)
  await restore(host)
  expect(JSON.parse(files[SETTINGS]!)).toEqual(original)
})

test('ensureRefresh leaves a command that only reads ops-control status files alone', async () => {
  const reader = JSON.stringify({ statusLine: { type: 'command', command: 'cat /home/u/.claude/ops-control/status/x' } })
  const { host, files } = fakeHost({ files: { [SETTINGS]: reader } })
  await ensureRefresh(host)
  expect(files[SETTINGS]).toBe(reader)
})

test('statusText: split puts the lines on two rows; without it they join', () => {
  const T = resolveTheme('classic', {}).theme
  const m = { ...initialModel(), ctxPercent: 48 }
  expect(statusText(m, T, { fields: ['activity', BREAK, 'ctx'], split: true })).toBe('◆ idle\nctx 48%')
  expect(statusText(m, T, { fields: ['activity', BREAK, 'ctx'] })).toBe('◆ idle · ctx 48%')
  expect(statusText(m, T, { fields: ['activity', BREAK, '5h'], split: true })).toBe('◆ idle')
})
