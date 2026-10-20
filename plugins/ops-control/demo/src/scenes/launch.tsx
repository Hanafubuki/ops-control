import {Node, Rect, Txt, makeScene2D} from '@revideo/2d';
import {all, linear, useTime, waitFor, ThreadGenerator} from '@revideo/core';
import {lookOf} from '../data';
import {LookSig} from '../look';
import {Pet} from '../pixels';
import {Claude, CHAT} from '../screen';
import {Stage} from '../stage';
import {Block, CW, Entry, LH} from '../term';
import {C, Dissolve, HUD_H, Hud, PF, Rectangle, Spot, U, Veil, ground, screen} from '../game';

const INSTALL = 'curl -fsSL https://glowup.khimani.dev/install.sh | sh';
const CELL = 15; // screen pixels per terminal cell at 1x; 2x is 30
const S1 = CELL / CW;
const PANE_X = CHAT + 2 + 2;

const EDIT: Entry = {k: 'tool', tool: 'Edit', arg: 'theme.css', res: 'Added 12 lines, removed 3'};
const FIX: Entry = {k: 'tool', tool: 'Edit', arg: 'theme.test.ts', res: 'Added 2 lines, removed 1'};
const PASS: Entry = {k: 'tool', tool: 'Bash', arg: 'just test', res: '142 passed'};
const WIN: Entry = {k: 'asst', text: 'Dark mode toggle added. Tests are green.', xp: 40};

export default makeScene2D('launch', function* (view) {
  screen.w = view.size().x;
  screen.h = view.size().y;
  const W = screen.w;
  const H = screen.h;
  const stage = new Stage(view);
  yield stage.run();
  view.add(<Rect width={W} height={H} fill={C.deep} />);

  const look = LookSig.of('arcade');
  const c = new Claude(look, stage, {chrome: false, pix: {pw: CW, ph: 16 / S1}});
  const dock = c.form === 'dock';
  const T = c.term;
  c.set({files: [], plan: []});
  c.pet.sprite.opacity(0);
  view.add(T.root);

  const fx = (<Node />) as Node;
  view.add(fx);
  const veil = new Veil({});
  const spot = new Spot({});
  const dis = new Dissolve({});
  fx.add(veil);
  fx.add(spot);
  fx.add(dis);
  const hud = new Hud({xp: 35});
  view.add(hud.node);

  // Camera: the terminal is the world. Zoom is 1 or 2 cells-of-15-px, nothing in between, and
  // the camera cuts rather than drifts. Panning keeps the frame inside the terminal.
  const cam = {S: S1, x: 0, y: 0};
  const origin = T.screen.position();
  function snap(zoom: number, col: number, row: number) {
    const S = S1 * zoom;
    const halfW = W / 2 / S;
    const halfH = (H - HUD_H) / 2 / S;
    const clamp = (v: number, half: number, size: number) => (size / 2 > half ? Math.max(-size / 2 + half, Math.min(size / 2 - half, v)) : 0);
    const lx = clamp(origin.x + col * CW, halfW, T.width);
    const ly = clamp(origin.y + row * LH, halfH, T.height);
    cam.S = S;
    cam.x = Math.round(-S * lx);
    cam.y = Math.round(HUD_H / 2 - S * ly);
    T.root.position([cam.x, cam.y]).scale(S);
  }
  const at = (col: number, row: number) => ({
    x: W / 2 + cam.x + cam.S * (origin.x + col * CW),
    y: H / 2 + cam.y + cam.S * (origin.y + row * LH),
  });
  const cells = (c0: number, r0: number, c1: number, r1: number): Rectangle => {
    const a = at(c0, r0);
    const b = at(c1, r1);
    return {x: Math.round(a.x), y: Math.round(a.y), w: Math.round(b.x - a.x), h: Math.round(b.y - a.y)};
  };
  snap(1, 0, 0);

  // Focus: dither steps in over six frames, holds, and snaps out. Nothing blurs.
  function* spotIn(hole: Rectangle | null): ThreadGenerator {
    spot.hole = hole;
    for (const l of [1, 2, 3]) {
      spot.level = l;
      yield* waitFor(0.07);
    }
  }
  function* spotOut(): ThreadGenerator {
    for (const l of [2, 1, 0]) {
      spot.level = l;
      yield* waitFor(0.07);
    }
  }
  function* focus(hole: Rectangle, hold: number): ThreadGenerator {
    yield* spotIn(hole);
    yield* waitFor(hold);
    yield* spotOut();
  }
  function* dissolve(from: number, to: number): ThreadGenerator {
    const steps = [0.25, 0.5, 0.75, 1];
    for (const p of from < to ? steps : [...steps].reverse().slice(1).concat(0)) {
      dis.p = p;
      yield* waitFor(0.06);
    }
  }

  // Row of a tool card, with its result line once it has one.
  const cardHole = (b: Block, withRes: boolean) => cells(-0.3, b.row + 0.4, 56.3, b.row + (withRes ? 4 : 3));
  // Clawd and his bubble, in the pane (docked) or the drawer (narrow window).
  const clawdHole = (text: string) => (dock ? cells(PANE_X + 1, 17, PANE_X + 37, 26.4) : cells(0.4, 18.5, 7 + text.length + 1.2, 20.4));
  const clawdZoom = () => (dock ? snap(2, PANE_X + 19, 20.5) : snap(2, 18, 18.5));

  let score = 0;
  const addScore = (n: number) => {
    score += n;
    hud.set({score});
  };

  const settle = (b: Block, ok: boolean) => {
    b.status(ok ? 'ok' : 'fail');
    b.res?.opacity(1);
  };

  function* typeHuman(text: string, per = 0.075): ThreadGenerator {
    for (let i = 1; i <= text.length; i++) {
      c.prompt.text(text.slice(0, i));
      yield* waitFor(per * (0.6 + 0.9 * (((i * 37) % 7) / 7)) + (text[i - 1] === ' ' ? 0.04 : 0));
    }
  }

  function* tool(e: Entry, glyph: string, label: string, tone: 'read' | 'edit' | 'shell', work: number): Generator<any, Block, any> {
    const b = c.convo.add(e, 'run', false);
    yield* c.convo.show(b, 0.15);
    c.act(glyph, label, tone);
    c.showSpinner(true);
    yield* waitFor(work);
    return b;
  }

  function* stream(e: Entry & {k: 'asst'}, seconds: number): Generator<any, Block, any> {
    const full = e.text;
    const b = c.convo.add({...e, text: ''}, 'ok', true);
    c.showSpinner(true);
    yield* b.main!.text(full, seconds, linear);
    return b;
  }

  function page(entries: Entry[]) {
    c.convo.clear();
    c.showSpinner(false);
    for (const e of entries) c.convo.add(e, 'ok');
  }

  // 1. Title, over the dimmed session.
  const title = (<Node />) as Node;
  veil.level = 2;
  const plate = (w: number, top: number, h: number) => {
    const y = top + h / 2 - H / 2;
    const n = (<Node />) as Node;
    n.add(<Rect x={16} y={y + 16} width={w} height={h} fill={C.deep} />);
    n.add(<Rect y={y} width={w} height={h} fill={C.bg} stroke={C.pink} lineWidth={8} />);
    n.add(<Rect y={y} width={w - 32} height={h - 32} stroke={C.faint} lineWidth={U} />);
    return n;
  };
  const word = (text: string, x: number, y: number, size: number, fill: string) => (
    <Txt text={text} x={x} y={y - H / 2} fontFamily={PF} fontSize={size} fill={fill} />
  );
  const plateW = Math.min(1160, W - 120);
  title.add(plate(plateW, 200, 420));
  title.add(word('OPS_CONTROL', 16, 346, 128, C.faint));
  title.add(word('OPS_CONTROL', 8, 338, 128, C.pink));
  title.add(word('OPS_CONTROL', 0, 330, 128, C.yellow));
  const start = word('PRESS START', 0, 480, 32, C.text) as Txt;
  title.add(start);
  title.add(word('© 2026 NOVUSEDGE', 0, 570, 16, C.dim));
  const groundY = H - 96;
  title.add(ground(groundY, 96));
  const pw = dock ? 12 : 10;
  const walker = new Pet(pw, pw, -W / 2 - 24 * pw, -W, W);
  walker.speed = 3;
  walker.sprite.y(groundY - H / 2 - 12 * pw);
  title.add(walker.sprite);
  const target = dock ? -430 : -200;
  let pressed = 0;
  let arrived = false;
  stage.tickers.push(t => {
    walker.update(t);
    if (!arrived && walker.x >= target) {
      arrived = true;
      walker.play('idle', t);
    }
    start.opacity(pressed ? (Math.floor((t - pressed) * 15) % 2 === 0 ? 1 : 0) : Math.floor(t * 2) % 2 === 0 ? 1 : 0);
  });
  // Veil at the bottom, the title above it, focus and dissolve on top.
  fx.add(title);
  title.moveToBottom();
  veil.moveToBottom();
  walker.play('walk');
  yield* waitFor(3);
  pressed = useTime();
  yield* waitFor(0.45);
  yield* dissolve(0, 1);
  title.remove();
  veil.level = 0;
  c.pet.sprite.opacity(1);
  yield* dissolve(1, 0);

  // 2. Turn 1: the prompt, a streamed reply, tool rows landing one by one.
  yield* waitFor(0.3);
  yield* typeHuman('add a dark mode toggle');
  yield* waitFor(0.3);
  c.prompt.text('');
  const u = c.convo.add({k: 'user', text: 'add a dark mode toggle'}, 'ok', false);
  yield* c.convo.show(u, 0.15);
  c.act('✻', 'Thinking', 'text');
  c.showSpinner(true);
  c.pet.play('working');
  yield* waitFor(0.7);
  yield* stream({k: 'asst', text: 'I will add the toggle to theme.css.'}, 1.2);
  yield* waitFor(0.2);

  const read = (yield* tool({k: 'tool', tool: 'Read', arg: 'theme.css'}, '▸', 'Reading theme.css', 'read', 0.5)) as unknown as Block;
  settle(read, true);
  hud.set({xp: 40});
  addScore(40);
  yield* waitFor(0.2);

  const edit = (yield* tool(EDIT, '✎', 'Editing theme.css', 'edit', 0.6)) as unknown as Block;
  settle(edit, true);
  c.set({files: [{path: 'theme.css', add: 12, del: 3, how: 'edit'}]});
  hud.set({xp: 50});
  addScore(80);
  yield* focus(cardHole(edit, true), 0.55);

  // 3. A failing run costs a heart.
  page([EDIT]);
  const run = (yield* tool({k: 'tool', tool: 'Bash', arg: 'just test', res: '1 failed: theme.test.ts', ok: false}, '$', 'Running just test', 'shell', 0.9)) as unknown as Block;
  settle(run, false);
  c.showSpinner(false);
  c.act('✗', '1 failed: theme.test.ts', 'fail');
  c.pet.play('fail');
  yield* focus(cardHole(run, true), 0.4);
  clawdZoom();
  const ouch = 'ouch, 1 failed';
  yield* spotIn(clawdHole(ouch));
  yield* all(
    c.say('fail', 0, {n: 1}, 1.5),
    (function* (): ThreadGenerator {
      hud.set({lives: 2, ghost: 2, ghostOn: true});
      for (let i = 0; i < 4; i++) {
        yield* waitFor(0.1);
        hud.set({ghostOn: i % 2 === 1});
      }
    })(),
  );
  yield* spotOut();
  snap(1, 0, 0);
  yield* (stream({k: 'asst', text: 'theme.test.ts fails on the toggle. Fixing it.'}, 1.1));
  yield* waitFor(0.3);

  // 4. The fix passes: XP, level up, Clawd hops.
  page([]);
  c.pet.play('working');
  const fix = (yield* tool(FIX, '✎', 'Editing theme.test.ts', 'edit', 0.5)) as unknown as Block;
  settle(fix, true);
  c.set({files: [{path: 'theme.css', add: 12, del: 3, how: 'edit'}, {path: 'theme.test.ts', add: 2, del: 1, how: 'edit'}]});
  hud.set({xp: 60});
  addScore(80);
  const ok = (yield* tool(PASS, '$', 'Running just test', 'shell', 0.8)) as unknown as Block;
  settle(ok, true);
  c.showSpinner(false);
  c.act('✓', '142 passed', 'pass');
  const row = c.convo.next;
  const reply = c.convo.add(WIN, 'ok', true);
  yield* reply.main!.text(WIN.text, 0, linear);
  yield* focus(cells(CHAT - 7.6, row - 0.1, CHAT - 0.5, row + 1.1), 0.7);
  clawdZoom();
  yield* spotIn(clawdHole('all done'));
  c.pet.play('hop');
  yield* all(
    c.say('done', 0, {}, 1.5),
    (function* (): ThreadGenerator {
      for (const xp of [70, 80, 90, 100]) {
        hud.set({xp});
        yield* waitFor(0.07);
      }
      for (let i = 0; i < 6; i++) {
        hud.set({flash: i % 2 === 0, levelLabel: 'LEVEL UP', level: i < 3 ? 1 : 2});
        yield* waitFor(0.08);
      }
      hud.set({flash: false, levelLabel: 'LEVEL', level: 2, xp: 0});
      addScore(1000);
    })(),
  );
  yield* spotOut();
  snap(1, 0, 0);

  // 5. In-session features: the Plan & context tab, then a pack switch that repaints in place.
  c.set({
    plan: [
      {title: 'Read the styles', status: 'completed'},
      {title: 'Add the toggle', status: 'completed'},
      {title: 'Run the tests', status: 'completed'},
    ],
    ctxPct: 46,
    ctxHistory: [...c.model.ctxHistory, 46],
  });
  c.setTab('plan');
  addScore(40);
  yield* focus(dock ? cells(PANE_X - 0.3, 2.8, PANE_X + 48.3, 16.2) : cells(0.4, 14.8, CHAT - 1, 19), 1.4);

  const repack = function* (name: string, per: number): ThreadGenerator {
    yield* typeHuman(`/ops pack ${name}`, per);
    yield* waitFor(0.2);
    c.prompt.text('');
    yield* dissolve(0, 1);
    look.set(lookOf(name));
    c.restyle();
    page([FIX, PASS, WIN]);
    yield* dissolve(1, 0);
  };
  page([FIX, PASS, WIN]);
  yield* repack('crt', 0.06);
  yield* focus(cells(-0.3, 0.4, CHAT + 0.3, 12), 0.8);
  yield* repack('arcade', 0.04);
  yield* waitFor(0.5);

  // 6. High scores, over the dimmed session. The install line is the INSERT COIN line.
  yield* dissolve(0, 1);
  c.pet.sprite.opacity(0);
  veil.level = 2;
  const end = (<Node />) as Node;
  const top = dock ? 120 : 110;
  end.add(plate(Math.min(1560, W - 120), top, dock ? 680 : 640));
  const hi = (t: string, y: number, size: number, fill: string, shadow = false) => {
    if (shadow) end.add(word(t, 6, y + 6, size, C.faint));
    end.add(word(t, 0, y, size, fill));
  };
  hi('HIGH SCORES', top + 90, 40, C.yellow, true);
  const names = [['1ST', score], ['2ND', 800], ['3RD', 450], ['4TH', 120]] as const;
  names.forEach(([place, s], i) => {
    const line = `${place}  CLAWD  ${String(s).padStart(6, '0')}`;
    hi(line, top + 170 + i * 48, 24, i === 0 ? C.text : C.dim);
  });
  const coin = word('INSERT COIN', 0, top + 390, 32, C.pink) as Txt;
  end.add(coin);
  const cmdSize = dock ? 24 : 16;
  const boxW = INSTALL.length * cmdSize + 64;
  end.add(<Rect y={top + 470 - H / 2} width={boxW} height={cmdSize + 56} fill={C.deep} stroke={C.green} lineWidth={U} />);
  hi(INSTALL, top + 470, cmdSize, C.green);
  hi('glowup.khimani.dev', top + 565, 16, C.dim);
  end.add(ground(groundY, 96));
  const pw2 = dock ? 12 : 10;
  const dancer = new Pet(pw2, pw2, -12 * pw2, -W, W);
  dancer.sprite.y(groundY - H / 2 - 12 * pw2);
  end.add(dancer.sprite);
  stage.tickers.push(t => {
    dancer.update(t);
    coin.opacity(Math.floor(t * 2) % 2 === 0 ? 1 : 0);
  });
  fx.add(end);
  end.moveToBottom();
  veil.moveToBottom();
  dancer.play('done');
  yield* dissolve(1, 0);
  yield* waitFor(5);
});
