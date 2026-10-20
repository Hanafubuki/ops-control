import {Line, Node, Rect, Txt} from '@revideo/2d';
import {useTime} from '@revideo/core';
import {planOrder} from '../../hooks/tasks.ts';
import {brailleArea, chartTop, markBar, outlook, tokensK} from '../../hooks/trend.ts';
import {Look} from './data';
import {Braille, CW, FONT, FS, LH, Paint, QUAD, Term, binders, isBraille} from './term';

// The ops-control pane as hooks/pane.tsx draws it: rows are lists of colored segments, built by
// the same rules (what a tab lists, how the context bar is split, what the status box says)
// and drawn one cell at a time so the camera can zoom without blurring.

export type Seg = {text: string; color: Paint; bold?: boolean; spin?: boolean};
export type TabId = 'changes' | 'agents' | 'plan';
export const TABS: [TabId, string][] = [['changes', 'Changes'], ['agents', 'Agents'], ['plan', 'Plan & context']];
export const COMPACT_ROWS = 6;

export type Act = {glyph: string; label: string; tone: 'text' | 'dim' | 'read' | 'edit' | 'shell' | 'agent' | 'pass' | 'fail' | 'accent'};
export type AgentRow = {name: string; task: string; now?: string; state: 'running' | 'done'; secs: number; tokens: number};
export type PlanRow = {title: string; active?: string; status: 'pending' | 'in_progress' | 'completed'};
export type FileRow = {path: string; add: number; del: number; how: 'edit' | 'new'};
export type Limit = {kind: 'five_hour' | 'seven_day'; percentUsed: number};

export type Model = {
  working: boolean;
  act: Act;
  agents: AgentRow[];
  plan: PlanRow[];
  files: FileRow[];
  ctxPct: number;
  ctxHistory: number[];
  limits?: Limit[];
  cats: Cat[];
  maxTokens: number;
  compactions: number;
  ctx: CtxDetail;
};

export type Cat = {name: string; tokens: number; kind: string};
export type Heavy = {kind: string; name: string; tokens: number; note?: string};
// What the mod reads from the context breakdown beyond the categories (CtxDetail in hooks/pane.tsx).
export type CtxDetail = {threshold: number; window: number; heavy: Heavy[]; cacheHit?: number};

// hooks/ctxchart.ts without its imports: that file pulls in layout.tsx, which this project's JSX settings cannot type.
const SHORT: [RegExp, string][] = [[/system prompt/i, 'system'], [/system tools/i, 'tools'], [/mcp/i, 'mcp'], [/memory/i, 'memory'], [/messages?/i, 'messages']];
const shortName = (n: string) => SHORT.find(([re]) => re.test(n))?.[1] ?? n.toLowerCase().slice(0, 10);

// One bar of `width` cells; largest-remainder rounding keeps the cells summing to the width.
function stackBar(cats: Cat[], max: number, width: number) {
  const used = cats.filter(x => x.kind === 'used' && x.tokens > 0).sort((a, b) => b.tokens - a.tokens);
  const parts = used.map(x => ({label: shortName(x.name), share: x.tokens / max}));
  const shares = [...parts.map(p => p.share), Math.max(0, 1 - parts.reduce((n, p) => n + p.share, 0))];
  const exact = shares.map(x => x * width);
  const cells = exact.map(Math.floor);
  let left = width - cells.reduce((a, b) => a + b, 0);
  for (const i of exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]).map(x => x[1])) {
    if (left <= 0) break;
    cells[i]++;
    left--;
  }
  return parts.map((p, i) => ({label: p.label, pct: Math.round(p.share * 100), cells: cells[i]}));
}

export const READY: Act = {glyph: '✻', label: 'Ready', tone: 'text'};

export const initialModel = (): Model => ({
  working: false,
  act: READY,
  agents: [],
  plan: [
    {title: 'Read the styles', status: 'completed'},
    {title: 'Add the toggle', active: 'Adding the toggle', status: 'in_progress'},
    {title: 'Run the tests', status: 'pending'},
  ],
  files: [
    {path: 'theme.css', add: 12, del: 3, how: 'edit'},
    {path: 'app.tsx', add: 4, del: 1, how: 'edit'},
  ],
  ctxPct: 38,
  ctxHistory: [9, 14, 19, 24, 28, 32, 35, 38],
  limits: [{kind: 'five_hour', percentUsed: 30}, {kind: 'seven_day', percentUsed: 12}],
  cats: [
    {name: 'Messages', tokens: 36000, kind: 'used'},
    {name: 'System tools', tokens: 18000, kind: 'used'},
    {name: 'MCP tools', tokens: 12000, kind: 'used'},
    {name: 'Memory files', tokens: 6000, kind: 'used'},
    {name: 'System prompt', tokens: 4000, kind: 'used'},
  ],
  maxTokens: 200000,
  compactions: 0,
  ctx: {
    threshold: 167000,
    window: 200000,
    heavy: [
      {kind: 'mcp', name: 'linear', tokens: 12000, note: '31 tools'},
      {kind: 'memory', name: 'CLAUDE.md', tokens: 4200, note: 'project'},
      {kind: 'skills', name: '24 listed', tokens: 2900},
    ],
    cacheHit: 91,
  },
});

const len = (s: Seg[]) => s.reduce((n, x) => n + [...x.text].length, 0);
const sp = (n: number): Seg => ({text: ' '.repeat(Math.max(1, n)), color: 'text'});

function clip(segs: Seg[], w: number): Seg[] {
  if (len(segs) <= w) return segs;
  const out: Seg[] = [];
  let used = 0;
  for (const s of segs) {
    const n = [...s.text].length;
    if (used + n < w) {
      out.push(s);
      used += n;
      continue;
    }
    out.push({...s, text: [...s.text].slice(0, Math.max(0, w - used - 1)).join('') + '…'});
    break;
  }
  return out;
}

// The left part shrinks so the right part always shows, flush to the edge.
function spread(left: Seg[], right: Seg[], w: number): Seg[] {
  const rl = len(right);
  const l = clip(left, Math.max(1, w - rl - 1));
  return clip([...l, sp(w - len(l) - rl), ...right], w);
}

const header = (l: string, r: string, w: number): Seg[] => spread([{text: l, color: 'text', bold: true}], [{text: r, color: 'dim'}], w);

function cap(rows: Seg[][], w: number, reserve = 0, limit = COMPACT_ROWS): Seg[][] {
  const room = limit - reserve;
  if (rows.length <= room) return rows;
  return [...rows.slice(0, room - 1), clip([{text: `  … ${rows.length - room + 1} more`, color: 'dim'}], w)];
}

// The glyphs Ink draws for each borderStyle, as in hooks/pane.tsx.
const BOX: Record<string, {tl: string; tr: string; bl: string; br: string; h: string; v: string}> = {
  round: {tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│'},
  single: {tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│'},
  double: {tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║'},
  bold: {tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃'},
  classic: {tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|'},
};
const MIN_BOX = 16;
const boxInner = (w: number) => (w >= MIN_BOX ? w - 4 : w);

// Top edge: corner, rule, title, rule fill, right text, rule, corner. The right text goes first when room runs out.
function section(title: string, right: string, body: Seg[][], w: number, border: string): Seg[][] {
  if (w < MIN_BOX) return [header(title, right, w), ...body.map(r => clip(r, w))];
  const b = BOX[border] ?? BOX.round;
  const inner = w - 4;
  const edge = (text: string): Seg => ({text, color: 'faint'});
  const name: Seg = {text: ` ${title} `, color: 'text', bold: true};
  let tail: Seg[] = right ? [{text: ` ${right} `, color: 'dim'}] : [];
  if (len([name, ...tail]) > w - 5) tail = [];
  const label = clip([name], w - 5);
  const fill = w - 4 - len(label) - len(tail);
  const top = [edge(b.tl + b.h), ...label, edge(b.h.repeat(fill)), ...tail, edge(b.h + b.tr)];
  const row = (r: Seg[]): Seg[] => {
    const c = clip(r, inner);
    return [edge(b.v + ' '), ...c, {text: ' '.repeat(inner - len(c) + 1), color: 'text'}, edge(b.v)];
  };
  return [top, ...body.map(row), [edge(b.bl + b.h.repeat(w - 2) + b.br)]];
}

function changes(m: Model, look: Look, w: number, compact: boolean, limit: number): Seg[][] {
  const add = m.files.reduce((n, f) => n + f.add, 0);
  const del = m.files.reduce((n, f) => n + f.del, 0);
  const lead = compact ? '  ' : '';
  const iw = compact ? w : boxInner(w);
  const body: Seg[][] = [];
  if (!m.files.length) body.push([{text: lead + 'Nothing changed yet.', color: 'dim'}]);
  for (const f of m.files) {
    const left: Seg[] = [{text: lead, color: 'text'}, {text: '✎ ', color: 'edit'}, {text: f.path + (f.how === 'new' ? '  new' : ''), color: 'text'}];
    body.push(spread(left, [{text: `+${f.add}`, color: 'pass'}, {text: ` −${f.del}`, color: 'fail'}], iw));
  }
  if (compact) return cap(body, w, 0, limit).map(r => clip(r, w));
  return section('CHANGES', `${m.files.length} files  +${add} −${del}`, body, w, look.border);
}

function agents(m: Model, look: Look, w: number, compact: boolean, limit: number): Seg[][] {
  const live = m.agents.filter(a => a.state === 'running').length;
  const iw = boxInner(w);
  const body: Seg[][] = [];
  if (!m.agents.length) body.push([{text: (compact ? '  ' : '') + 'No subagents this session.', color: 'dim'}]);
  for (const a of m.agents) {
    const running = a.state === 'running';
    const mark: Seg = running ? {text: '⠋', color: 'agent', spin: true} : {text: '✓', color: 'pass'};
    if (compact) {
      body.push(clip([{text: ` ◆ ${a.name} `, color: 'agent', bold: true}, mark, {text: ' ' + (running ? a.now ?? a.task : a.task), color: running ? 'read' : 'dim'}], w));
      continue;
    }
    if (body.length) body.push([]);
    body.push(spread([{text: '◆ ' + a.name, color: 'agent', bold: true}], [{text: `${a.secs}s · ${(a.tokens / 1000).toFixed(1)}k `, color: 'dim'}, mark], iw));
    body.push(clip([{text: '  ' + a.task, color: 'text'}], iw));
    if (running && a.now) body.push(clip([{text: '  └ ', color: 'faint'}, {text: a.now, color: 'read'}], iw));
  }
  if (compact) return cap(body, w, 0, limit);
  return section('AGENTS', `${live} running · ${m.agents.length - live} done`, body, w, look.border);
}

// The roles palette() in hooks/ctxchart.ts hands out, in its order.
const STACK = ['read', 'agent', 'shell', 'edit', 'accent'] as const;

function stack(m: Model, width: number) {
  const slices = stackBar(m.cats, m.maxTokens, width).map((x, i) => ({...x, color: STACK[i] ?? 'text'}));
  const segs: Seg[] = slices.filter(x => x.cells > 0).map(x => ({text: '█'.repeat(x.cells), color: x.color}));
  const used = slices.reduce((n, x) => n + x.cells, 0);
  if (width - used > 0) segs.push({text: '░'.repeat(width - used), color: 'faint'});
  return {segs, slices};
}

function planRow(p: PlanRow, w: number, lead: string): Seg[] {
  const on = p.status === 'in_progress';
  const done = p.status === 'completed';
  return clip([{text: `${lead}${done ? '✓' : on ? '◉' : '○'} `, color: done ? 'pass' : on ? 'accent' : 'dim'}, {text: on && p.active ? p.active : p.title, color: done ? 'dim' : 'text', bold: on}], w);
}

// markCompact, trend, heavyRow and stats in hooks/pane.tsx.
const markCompact = (segs: Seg[], m: Model, w: number): Seg[] =>
  markBar(segs, Math.min(w - 1, Math.floor((m.ctx.threshold / m.maxTokens) * w)), {text: '┊', color: 'text'});

function trend(m: Model, w: number): Seg[][] {
  if (!m.ctxHistory.length) return [];
  const line = (m.ctx.threshold / m.ctx.window) * 100;
  const top = chartTop(m.ctxHistory, line);
  const label = w >= 24 ? ` ${Math.round(top)}%`.padStart(5) : '';
  const {rows, data} = brailleArea(m.ctxHistory, w - label.length, line, top);
  const out = rows.map(r => [...r].reduce<Seg[]>((segs, ch, i) => {
    const color = data[i] ? 'accent' : 'dim';
    const last = segs.at(-1);
    if (last?.color === color) last.text += ch;
    else segs.push({text: ch, color});
    return segs;
  }, []));
  if (label) out[0].push({text: label, color: 'dim'});
  const says = outlook(m.ctxHistory, m.ctxPct, true, line, m.ctx.window);
  if (says) out.push(clip([{text: says, color: 'dim'}], w));
  return out;
}

const heavyRow = (h: Heavy, w: number): Seg[] =>
  spread([{text: h.kind.padEnd(7), color: 'dim'}, {text: h.name, color: 'text'}, ...(h.note ? [{text: '  ' + h.note, color: 'dim' as const}] : [])], [{text: tokensK(h.tokens), color: 'text'}], w);

function stats(m: Model, w: number): Seg[] {
  const says = [m.ctx.cacheHit !== undefined ? `cache hit ${m.ctx.cacheHit}%` : '', `peak ${Math.max(...m.ctxHistory, m.ctxPct)}%`, m.compactions ? `compacted ${m.compactions}×` : ''];
  return clip([{text: says.filter(Boolean).join(' · '), color: 'dim'}], w);
}

function plan(m: Model, look: Look, w: number, compact: boolean, limit: number): Seg[][] {
  const done = m.plan.filter(p => p.status === 'completed').length;
  const lead = compact ? '  ' : '';
  const iw = compact ? w : boxInner(w);
  const {items: shown, hiddenDone} = planOrder(m.plan as never);
  const items = (shown as unknown as PlanRow[]).map(p => planRow(p, iw, lead));
  if (!m.plan.length) items.push([{text: lead + 'No task list yet.', color: 'dim'}]);
  if (compact) {
    const inner = Math.max(4, w - 12);
    const bar = stack(m, inner);
    const ctx: Seg[] = [{text: ' ctx ▕', color: 'dim'}, ...markCompact(bar.segs, m, inner), {text: `▏${String(m.ctxPct).padStart(4)}%`, color: 'text'}];
    return [...cap(items, w, 1, limit), clip(ctx, w)];
  }
  if (hiddenDone) items.push([{text: `  +${hiddenDone} more done`, color: 'dim'}]);
  const used = m.cats.filter(x => x.kind === 'used').reduce((n, x) => n + x.tokens, 0);
  const bar = stack(m, iw);
  const ctx: Seg[][] = [markCompact(bar.segs, m, iw)];
  // Legend items packed into rows of at most iw cells, three spaces apart.
  let row: Seg[] = [];
  for (const x of bar.slices.filter(x => x.cells > 0)) {
    const item: Seg[] = [{text: '● ', color: x.color}, {text: `${x.label} ${x.pct}%`, color: 'dim'}];
    if (row.length && len([...row, sp(3), ...item]) > iw) {
      ctx.push(clip(row, iw));
      row = [];
    }
    row = row.length ? [...row, sp(3), ...item] : item;
  }
  if (row.length) ctx.push(clip(row, iw));
  const chart = trend(m, iw);
  if (chart.length) ctx.push([], ...chart);
  if (m.ctx.heavy.length) ctx.push([], ...m.ctx.heavy.map(h => heavyRow(h, iw)));
  ctx.push(stats(m, iw));
  return [
    ...section('PLAN', m.plan.length ? `${done}/${m.plan.length}` : '', items, w, look.border),
    [],
    ...section('CONTEXT', `${m.ctxPct}% · ${tokensK(used)} / ${tokensK(m.maxTokens)}`, ctx, w, look.border),
  ];
}

export function tabRows(m: Model, tab: TabId, look: Look, w: number, compact: boolean, limit = COMPACT_ROWS): Seg[][] {
  return tab === 'changes' ? changes(m, look, w, compact, limit) : tab === 'agents' ? agents(m, look, w, compact, limit) : plan(m, look, w, compact, limit);
}

// hpBar and hearts in hooks/layout.tsx.
function lifeSegs(look: Look, hp: boolean, width: number, used: number, what: string): Seg[] {
  const left = Math.max(0, Math.min(100, 100 - used));
  if (!hp) {
    const full = Math.max(0, Math.min(5, Math.ceil(left / 20)));
    return [{text: '♥'.repeat(full), color: 'fail'}, {text: '♡'.repeat(5 - full), color: 'dim'}, {text: `  ${what} ${left}% left`, color: 'dim'}].filter(s => s.text) as Seg[];
  }
  const short = width - (5 + `100% ${what} left`.length) < 5;
  const w = short ? Math.max(3, width - 9) : width - 5 - `100% ${what} left`.length;
  const n = Math.round((left / 100) * w);
  // Flat blocks in three bands, not the mod's smooth gradient, so the video stays on the pixel grid.
  const band = (i: number): Paint => (i < w / 3 ? look.c.fail : i < (2 * w) / 3 ? look.c.edit : look.c.pass);
  const blocks: Seg[] = Array.from({length: w}, (_, i) => ({text: i < n ? '█' : '░', color: i < n ? band(i) : 'faint'}));
  return [{text: 'HP ', color: 'accent', bold: true}, ...blocks, {text: short ? `  ${left}%` : `  ${left}% ${what} left`, color: 'dim'}];
}

// lifeRow in hooks/pane.tsx without the spend case: the demo session has no cost.
export function statusRows(m: Model, look: Look, hp: boolean, width: number): Seg[][] {
  const windows = [['five_hour', '5h limit'], ['seven_day', 'weekly limit']] as const;
  const tight = windows
    .flatMap(([kind, what]) => (m.limits ?? []).filter(l => l.kind === kind).map(l => ({used: Math.round(l.percentUsed), what})))
    .sort((a, b) => b.used - a.used)[0];
  const {used, what} = tight ?? {used: m.ctxPct, what: 'context'};
  const life = lifeSegs(look, hp, width, used, what);
  const rows: Seg[][] = [[{text: `${m.act.glyph} ${m.act.label}`, color: m.act.tone, bold: true}], life];
  const live = m.agents.filter(a => a.state === 'running');
  if (live.length) rows.push([{text: `◆ ${live.map(a => a.name).join(', ')} working`, color: 'agent'}]);
  return rows.map(r => clip(r, width));
}

// hooks/band.tsx: the action, subagents, hearts (or the arcade life bar from 80 columns) and plan progress.
export function bandSegs(m: Model, look: Look, hp: boolean, columns: number): Seg[] {
  const head: Seg[] = [{text: `${m.act.glyph} ${m.act.label}`, color: m.act.tone, bold: true}];
  const tail: Seg[] = [];
  const live = m.agents.filter(a => a.state === 'running').length;
  const dot: Seg = {text: '  ·  ', color: 'dim'};
  if (live) tail.push(dot, {text: `◆ ${live} subagent${live === 1 ? '' : 's'}`, color: 'agent'});
  const full = Math.max(0, Math.min(5, Math.ceil((100 - m.ctxPct) / 20)));
  tail.push(dot);
  if (hp && columns >= 80) tail.push(...lifeSegs(look, true, Math.min(34, Math.floor(columns * 0.3)), m.ctxPct, 'context'));
  else tail.push({text: '♥'.repeat(full), color: 'fail'}, {text: '♡'.repeat(5 - full), color: 'dim'});
  if (m.plan.length) {
    const done = m.plan.filter(p => p.status === 'completed').length;
    tail.push(dot, {text: '◇ ', color: 'dim'}, {text: '●'.repeat(done) + '○'.repeat(m.plan.length - done), color: 'accent'});
  }
  if (len(tail) + 8 > columns) return clip(head, columns);
  return [...clip(head, columns - len(tail)), ...tail];
}

// Everything the font draws on the cell grid itself stays in a run; any other glyph falls
// back to another font whose advance would push its neighbours off the grid, so each sits alone.
const SAFE = /[\x20-\x7e·…−▀-▐▖-▟]/;

// Box-drawing glyphs as rectangles. The font's line pieces leave gaps between rows (the row is taller than the em box),
// and its shade blocks do not keep the cell advance. Arms are up, down, left, right: 1 light, 2 heavy, 3 double.
// Rounded corners come out square.
const ARMS: Record<string, [number, number, number, number]> = {
  '─': [0, 0, 1, 1], '│': [1, 1, 0, 0], '━': [0, 0, 2, 2], '┃': [2, 2, 0, 0], '═': [0, 0, 3, 3], '║': [3, 3, 0, 0],
  '╭': [0, 1, 0, 1], '╮': [0, 1, 1, 0], '╰': [1, 0, 0, 1], '╯': [1, 0, 1, 0],
  '┌': [0, 1, 0, 1], '┐': [0, 1, 1, 0], '└': [1, 0, 0, 1], '┘': [1, 0, 1, 0],
  '┏': [0, 2, 0, 2], '┓': [0, 2, 2, 0], '┗': [2, 0, 0, 2], '┛': [2, 0, 2, 0],
  '╔': [0, 3, 0, 3], '╗': [0, 3, 3, 0], '╚': [3, 0, 0, 3], '╝': [3, 0, 3, 0],
};
const THICK = [0, 2, 4, 2];
const ROUND = '╭╮╰╯';
// Vertical extent of the font's full block, so a free cell lines up with the filled ones beside it.
const SHADE_TOP = 3;
const SHADE_H = 32.5;
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

export function drawSegs(T: Term, parent: Node, col: number, row: number, segs: Seg[]) {
  let x = col;
  for (const s of segs) {
    let run = '';
    let start = x;
    const flush = () => {
      if (run) T.txt(run, start, row, s.color, {bold: s.bold, parent});
      run = '';
    };
    for (const ch of s.text) {
      if (ARMS[ch]) {
        flush();
        const [up, down, left, right] = ARMS[ch];
        const cx = x * CW + CW / 2;
        const cy = row * LH + LH / 2;
        if (ROUND.includes(ch)) {
          // A quarter arc as a rounded two-segment line; the radius is the shorter arm, half a cell wide.
          const pts: [number, number][] = [[cx, cy + (down ? LH / 2 : -LH / 2)], [cx, cy], [cx + (right ? CW / 2 : -CW / 2), cy]];
          parent.add(<Line points={pts} radius={CW / 2} lineWidth={THICK[1]} stroke={T.paint(s.color)} />);
        } else {
          const vs = down ? 1 : up ? -1 : 0;
          const hs = right ? 1 : left ? -1 : 0;
          // Each arm reaches the cell edge. A double arm is two lines 6 px apart; at a corner the outer pair
          // meets at the outer point and the inner pair at the inner one, so an arm starts at d * vs * hs.
          const arm = (n: number, horizontal: boolean, sign: number) => {
            if (!n) return;
            const t = THICK[n];
            for (const d of n === 3 ? [-3, 3] : [0]) {
              const start = vs && hs && n === 3 ? d * vs * hs : 0;
              const c = horizontal ? cx : cy;
              const a = c + start - (sign * t) / 2;
              const b = c + (sign * (horizontal ? CW : LH)) / 2;
              const mid = (a + b) / 2;
              const size = Math.abs(b - a);
              parent.add(<Rect x={horizontal ? mid : cx + d} y={horizontal ? cy + d : mid} width={horizontal ? size : t} height={horizontal ? t : size} fill={T.paint(s.color)} />);
            }
          };
          arm(up, false, -1);
          arm(down, false, 1);
          arm(left, true, -1);
          arm(right, true, 1);
        }
      } else if (ch === '░') {
        // The shade glyph is stippled and its fallback font ignores the cell advance, which leaves seams at the
        // edge of a bar; a flat tint of the same colour fills the cell exactly.
        flush();
        parent.add(<Rect x={x * CW} y={row * LH + SHADE_TOP} width={CW + 0.5} height={SHADE_H} offset={[-1, -1]} fill={T.paint(s.color)} opacity={0.3} />);
      } else if (QUAD[ch] !== undefined && ch !== '█') {
        // Quadrant blocks are drawn as rectangles: the font's glyphs leave seams once the camera zooms.
        flush();
        for (let k = 0; k < 4; k++) {
          if (!(QUAD[ch] & (1 << k))) continue;
          parent.add(<Rect x={x * CW + (k % 2) * (CW / 2)} y={row * LH + (k >> 1) * (LH / 2)} width={CW / 2 + 0.5} height={LH / 2 + 0.5} offset={[-1, -1]} fill={T.paint(s.color)} />);
        }
      } else if (SAFE.test(ch)) {
        if (!run) start = x;
        run += ch;
      } else {
        flush();
        if (isBraille(ch)) {
          const br = new Braille(x * CW, row * LH, T.paint(s.color));
          br.set(ch);
          parent.add(br.node);
          if (s.spin) binders.push(() => br.set(SPIN[Math.floor((useTime() * 1000) / 90) % SPIN.length]));
        } else {
          parent.add(
            <Txt text={ch} x={x * CW + CW / 2} y={row * LH} offset={[0, -1]} fontFamily={FONT} fontSize={FS} lineHeight={LH} fontWeight={s.bold ? 700 : 400} fill={T.paint(s.color)} />,
          );
        }
      }
      x++;
    }
    flush();
  }
}
