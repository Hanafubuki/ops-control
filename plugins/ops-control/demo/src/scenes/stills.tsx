import {Rect, makeScene2D} from '@revideo/2d';
import {useTime, waitFor} from '@revideo/core';
import {lookOf} from '../data';
import {LookSig} from '../look';
import {Claude} from '../screen';
import {Stage} from '../stage';
import {Entry} from '../term';
import {HOLD, STILL_SETS} from '../stills-plan';

// The README's stills: the plain terminal, the classic pack, no game layer. Each still sets the
// model and the tab, and render.ts takes one frame from its slot (see stills-plan.ts).
const ASK: Entry = {k: 'user', text: 'add a dark mode toggle'};
const PLAN: Entry = {k: 'asst', text: 'I will add the toggle to theme.css.'};
const READ: Entry = {k: 'tool', tool: 'Read', arg: 'theme.css'};
const EDIT: Entry = {k: 'tool', tool: 'Edit', arg: 'theme.css', res: 'Added 12 lines, removed 3'};
const FIX: Entry = {k: 'tool', tool: 'Edit', arg: 'theme.test.ts', res: 'Added 2 lines, removed 1'};
const PASS: Entry = {k: 'tool', tool: 'Bash', arg: 'just test', res: '142 passed'};
const WIN: Entry = {k: 'asst', text: 'Dark mode toggle added. Tests are green.'};
const SEARCH: Entry = {k: 'tool', tool: 'Task', arg: 'Find other theme consumers'};
const WAIT: Entry = {k: 'asst', text: 'The theme search is still running. I will report what it finds.'};

const FILES = [
  {path: 'theme.css', add: 12, del: 3, how: 'edit' as const},
  {path: 'theme.test.ts', add: 2, del: 1, how: 'edit' as const},
];

export default makeScene2D('stills', function* (view) {
  const W = view.size().x;
  const H = view.size().y;
  const stage = new Stage(view);
  yield stage.run();

  const look = LookSig.of('classic');
  view.add(<Rect width={W} height={H} fill={look.sig.bg} />);
  const set = Object.values(STILL_SETS).find(s => s.size.x === W && s.size.y === H) ?? STILL_SETS.dock;
  const c = new Claude(look, stage, {chrome: false, rows: set.rows});
  const T = c.term;
  view.add(T.root);
  // The terminal fills the frame's width; it is pinned to the top edge.
  const s = W / T.width;
  T.root.scale(s).position([0, -(H - T.height * s) / 2]);

  const page = (entries: Entry[]) => {
    c.convo.clear();
    for (const e of entries) c.convo.add(e, 'ok');
  };
  const slot = (i: number) => i * HOLD;
  const names: readonly string[] = set.names;

  for (const [i, name] of names.entries()) {
    if (name === 'pane-wide') {
      page([ASK, PLAN, EDIT, FIX, PASS, WIN]);
      c.set({
        files: [...FILES, {path: 'Toggle.tsx', add: 24, del: 0, how: 'new' as const}],
        act: {glyph: '✓', label: 'Done', tone: 'pass'},
        working: false,
      });
      c.setTab('changes');
      c.pet.play('idle');
    } else if (name === 'agents') {
      page([ASK, PLAN, READ, EDIT, SEARCH, WAIT]);
      c.set({
        working: true,
        files: FILES.slice(0, 1),
        act: {glyph: '✻', label: 'Waiting for 1 subagent', tone: 'text'},
        agents: [
          {name: 'Explore', task: 'Find other theme consumers', now: 'Grep("useTheme", src/)', state: 'running', secs: 28, tokens: 17300},
          {name: 'general-purpose', task: 'Check the stylesheet build', state: 'done', secs: 41, tokens: 22800},
        ],
      });
      c.setTab('agents');
      c.pet.play('working');
    } else if (name === 'context') {
      page([ASK, PLAN, READ, EDIT, FIX, PASS]);
      c.set({
        working: true,
        agents: [],
        files: FILES,
        act: {glyph: '✎', label: 'Editing Toggle.tsx', tone: 'edit'},
        plan: [
          {title: 'Read the styles', status: 'completed'},
          {title: 'Add the toggle', status: 'completed'},
          {title: 'Wire it into the header', active: 'Wiring it into the header', status: 'in_progress'},
          {title: 'Run the tests', status: 'pending'},
        ],
        ctxPct: 58,
        ctxHistory: [8, 15, 23, 31, 39, 47, 55, 61, 66, 14, 22, 29, 36, 43, 51, 58],
        compactions: 1,
        cats: [
          {name: 'Messages', tokens: 76000, kind: 'used'},
          {name: 'System tools', tokens: 18000, kind: 'used'},
          {name: 'MCP tools', tokens: 12000, kind: 'used'},
          {name: 'Memory files', tokens: 6000, kind: 'used'},
          {name: 'System prompt', tokens: 4000, kind: 'used'},
        ],
      });
      c.setTab('plan');
      c.pet.play('working');
    } else if (name.startsWith('pack-')) {
      // The pack stays applied for the stills after this one, so stills-plan lists these last.
      look.set(lookOf(name.slice('pack-'.length)));
      c.restyle();
      page([ASK, PLAN, EDIT, FIX, PASS, WIN]);
      c.set({
        files: [...FILES, {path: 'Toggle.tsx', add: 24, del: 0, how: 'new' as const}],
        act: {glyph: '✓', label: 'Done', tone: 'pass'},
        working: false,
        agents: [],
      });
      c.setTab('changes');
      c.pet.play('idle');
    } else {
      page([ASK, PLAN, EDIT, FIX, PASS, WIN]);
      c.set({
        files: FILES,
        act: {glyph: '✓', label: '142 tests passing', tone: 'pass'},
        working: true,
        ctxPct: 38,
      });
      c.setTab('changes');
    }
    // Hold until the slot ends; the first one starts at 0.
    yield* waitFor(slot(i + 1) - useTime());
  }
});
