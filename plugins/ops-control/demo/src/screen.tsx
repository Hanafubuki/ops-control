import {Node, Rect, Txt} from '@revideo/2d';
import {ThreadGenerator, all, easeInCubic, easeOutCubic, linear, map, tween, waitFor} from '@revideo/core';
import type {Mood} from '../../hooks/bubbles.ts';
import {CLAWD_COLOR, CLAWD_ROW} from '../../hooks/pets.ts';
import {say as line} from './data';
import {LookSig} from './look';
import {Pet} from './pixels';
import {Stage} from './stage';
import {CW, Convo, LH, SpinnerView, Term} from './term';
import {Act, Model, TABS, TabId, bandSegs, drawSegs, initialModel, statusRows, tabRows} from './pane';

export const CHAT = 64;
const PANE_W = 52;
const GAP = 2;
const STRIP = 44;
const PET_COLS = 24;

// How ops-control shows up depends on the window, as in hooks/register.tsx: a wide window docks the
// pane on the right (and the band steps aside, the pane's status box says the same), a narrow
// one gets the pane as a short drawer under the chat with the band above the prompt.
export type Form = 'dock' | 'inline';
export const formFor = (s: {x: number; y: number}): Form => (s.x / s.y > 1.3 ? 'dock' : 'inline');

// A Claude Code window with ops-control on top. Clawd lives only in the pane: the sprite at the
// bottom of the docked pane, or his one-row glyph at the bottom of the drawer.
export class Claude {
  readonly term: Term;
  readonly convo: Convo;
  readonly spin: SpinnerView;
  readonly pet: Pet;
  readonly prompt: Txt;
  readonly form: Form;
  readonly model: Model = initialModel();
  readonly rows: number;
  tab: TabId = 'changes';
  private bubbling = false;
  private dyn: Node;
  private statusLayer: Node;
  private top = 17;
  private goal = 17;
  private box!: Rect;
  private cursor!: Rect;
  private statusBox?: Rect;
  private bubble?: Node;
  private bubbleRect?: Rect;
  private bubbleText: Txt;
  private spinLabel: Txt;
  private escLabel: Txt;

  // Rows the docked layout gains over the usual 28: the status box, Clawd and his bubble move down
  // by this much and the tab gets the room.
  private lift = 0;

  constructor(readonly look: LookSig, readonly stage: Stage, o: {chrome?: boolean; pix?: {pw: number; ph: number}; rows?: number} = {}) {
    const dock = (this.form = formFor(stage.size)) === 'dock';
    const rows = (this.rows = dock ? (o.rows ?? 28) : 26);
    const lift = (this.lift = dock ? rows - 28 : 0);
    this.top = this.goal = 17 + lift;
    const T = (this.term = new Term(look, dock ? CHAT + GAP + PANE_W : CHAT, rows, undefined, o.chrome ?? true));
    T.txt('✻ Claude Code', 0, 0, 'accent', {bold: true});
    T.txt('/help for help', 15, 0, 'dim');
    this.convo = new Convo(T, 1, CHAT);

    this.spin = new SpinnerView(look, 0, 12, look.look.spinner);
    T.screen.add(this.spin.node);
    this.spinLabel = T.txt(() => look.word() + '…', 6, 12, 'spinTint');
    this.escLabel = T.txt('(esc to interrupt)', 6, 13, 'dim');
    this.dyn = (<Node />) as Node;
    T.screen.add(this.dyn);
    this.statusLayer = (<Node />) as Node;
    T.screen.add(this.statusLayer);

    this.box = T.rect(0, rows - 3.5, CHAT, 2, {stroke: look.sig.borderColor, lineWidth: 2, radius: 14}) as Rect;
    T.txt('>', 1, rows - 3, 'accent', {bold: true});
    this.prompt = T.txt('', 3, rows - 3, 'text');
    this.cursor = T.rect(3, rows - 2.9, 0.6, 0.8, {fill: look.sig.accent}) as Rect;
    T.txt('? for shortcuts', 0, rows - 1, 'dim');
    const tag = T.txt(() => 'ops-control · ' + look.title(), 0, rows - 1, 'accent');
    tag.offset([1, -1]).x(CHAT * CW);

    const x0 = CHAT + GAP + 2;
    if (dock) {
      T.rect(CHAT + GAP, 0.5, PANE_W, rows - 1, {stroke: look.sig.faint, lineWidth: 2, radius: 14});
      T.rect(x0 + 0.5, 0, 8, 1, {fill: look.sig.bg});
      T.txt(' ops-control ', x0 + 0.5, 0, 'accent', {bold: true});
      this.statusBox = T.rect(x0 + 0.5, 13.5, PANE_W - 5, 13, {stroke: look.sig.borderColor, lineWidth: 2, radius: 14}) as Rect;
      const strip = (x0 + 2) * CW;
      this.pet = new Pet(o.pix?.pw ?? CW, o.pix?.ph ?? LH / 2, strip + 8 * CW, strip, strip + (STRIP - PET_COLS) * CW);
      this.pet.sprite.y((20 + lift) * LH);
      T.screen.add(this.pet.sprite);
      this.bubble = (<Node opacity={0} />) as Node;
      this.bubbleRect = T.rect(x0 + 2, 17.5 + lift, 10, 2, {stroke: look.sig.accent, lineWidth: 2, radius: 12}, this.bubble) as Rect;
      this.bubbleText = T.txt('', x0 + 4, 18 + lift, 'text', {parent: this.bubble});
      T.screen.add(this.bubble);
    } else {
      // Not drawn: the drawer's Clawd is the one-row glyph. The Pet still times the clips.
      this.pet = new Pet(CW, LH / 2, 0);
      this.bubbleText = T.txt('', 7, 19, 'accent');
      this.bubbleText.opacity(0);
    }

    this.showSpinner(false);
    this.restyle();
    stage.tickers.push(t => {
      this.pet.update(t);
      this.spin.update(t);
      this.cursor.opacity(Math.floor(t * 2) % 2 === 0 ? 1 : 0.15);
      this.cursor.x(3 * CW + this.prompt.text().length * CW);
    });
  }

  // Everything that follows the pack's own style rather than its colors.
  restyle() {
    const b = this.look.look.border;
    this.box.lineWidth(b === 'bold' ? 4 : 2).radius(b === 'bold' ? 0 : 14);
    this.statusBox?.lineWidth(b === 'bold' ? 4 : 2).radius(b === 'bold' ? 0 : 14);
    this.bubbleRect?.radius(b === 'bold' ? 0 : 12);
    this.spin.anim = this.look.look.spinner;
    this.refresh();
  }

  // Redraws what depends on the model: tab strip and rows, the status box, or the drawer and band.
  // keepTop leaves the box where the tween in say() has it instead of snapping to the new goal.
  refresh(keepTop = false) {
    const T = this.term;
    const look = this.look.look;
    this.dyn.removeChildren();
    const tabs = (col: number, row: number) => {
      let c = col;
      for (const [id, label] of TABS) {
        const w = label.length + 2;
        if (id === this.tab) {
          T.rect(c, row, w, 1, {fill: this.look.sig.accent, radius: 6}, this.dyn);
          drawSegs(T, this.dyn, c + 1, row, [{text: label, color: 'bg', bold: true}]);
        } else {
          drawSegs(T, this.dyn, c + 1, row, [{text: label, color: 'dim'}]);
        }
        c += w + 1;
      }
    };
    if (this.form === 'dock') {
      const x0 = CHAT + GAP + 2;
      tabs(x0, 1);
      // The status box grows upward while Clawd's bubble is up, as the footer does in hooks/pane.tsx,
      // and the tab keeps the rows above it. Only the Changes tab is on screen while he talks.
      // Each status row past the usual two lifts the box by a row (footerRows counts them), so the
      // sprite, which stays put, is never drawn over the last one.
      const status = statusRows(this.model, look, look.hp, PANE_W - 8);
      const top = (this.bubbling ? 13 : 17) + this.lift - Math.max(0, status.length - 2);
      this.goal = top;
      if (!keepTop) this.top = top;
      this.place();
      tabRows(this.model, this.tab, look, PANE_W - 4, false)
        .slice(0, top - 3)
        .forEach((r, i) => drawSegs(T, this.dyn, x0, 3 + i, r));
      // Status rows sit in their own layer, drawn relative to the box top, so say() can slide them with the box.
      this.statusLayer.removeChildren();
      status.forEach((r, i) => drawSegs(T, this.statusLayer, x0 + 2, 1 + i, r));
      return;
    }
    tabs(1, 14);
    tabRows(this.model, this.tab, look, CHAT - 2, true, 4).forEach((r, i) => drawSegs(T, this.dyn, 1, 15 + i, r));
    drawSegs(T, this.dyn, 1, 19, [{text: CLAWD_ROW, color: CLAWD_COLOR}]);
    if (this.model.working) drawSegs(T, this.dyn, 0, this.rows - 5, bandSegs(this.model, look, look.hp, CHAT));
  }

  private place() {
    this.statusBox?.y((this.top + 0.5) * LH).height((this.rows - 2 - this.top) * LH);
    this.statusLayer.y(this.top * LH);
  }

  // Slides the status box from where it is to its goal over the bubble's fade.
  // Leaving eases in, so the rows reach the bubble's rows only after it has mostly faded.
  private slide(seconds: number, ease = easeOutCubic): ThreadGenerator {
    const from = this.top;
    return tween(seconds, v => {
      this.top = map(from, this.goal, ease(v));
      this.place();
    });
  }

  set(patch: Partial<Model>) {
    Object.assign(this.model, patch);
    this.refresh();
  }

  setTab(tab: TabId) {
    this.tab = tab;
    this.refresh();
  }

  act(glyph: string, label: string, tone: Act['tone']) {
    this.set({act: {glyph, label, tone}});
  }

  // The spinner sits right under the last row, as in Claude Code.
  showSpinner(on: boolean) {
    const o = on ? 1 : 0;
    const row = this.convo.next;
    this.spin.node.y(row * LH);
    this.spinLabel.y(row * LH);
    this.escLabel.y((row + 1) * LH);
    this.spin.node.opacity(o);
    this.spinLabel.opacity(o);
    this.escLabel.opacity(o);
    this.model.working = on;
    if (on && this.model.act.label === 'Ready') this.model.act = {glyph: '✻', label: 'Thinking', tone: 'text'};
    this.refresh();
  }

  get whole() {
    return {x: -this.term.width / 2, y: -this.term.height / 2, w: this.term.width, h: this.term.height};
  }

  *type(text: string, seconds: number) {
    yield* this.prompt.text(text, seconds, linear);
  }

  // Clawd's line for a mood, from the mod's own templates, in his bubble (docked) or after his glyph (drawer).
  *say(mood: Mood, index: number, vars: Parameters<typeof line>[2] = {}, hold = 1.2): ThreadGenerator {
    const text = line(mood, index, vars);
    const key = mood === 'fail' ? 'fail' : mood === 'done' ? 'pass' : 'accent';
    this.bubbleText.text(text);
    if (this.bubble) {
      this.bubbling = true;
      this.refresh(true);
    }
    let node: {opacity: (v: number, s?: number) => unknown} = this.bubbleText;
    if (this.bubble && this.bubbleRect) {
      this.bubbleRect.width((text.length + 4) * CW).stroke(this.look.sig[key]);
      node = this.bubble;
    } else {
      this.bubbleText.fill(this.look.sig[key]);
    }
    yield* all(node.opacity(1, 0.15) as ThreadGenerator, this.slide(0.15));
    yield* waitFor(hold);
    if (this.bubble) {
      this.bubbling = false;
      this.refresh(true);
    }
    yield* all(node.opacity(0, 0.2) as ThreadGenerator, this.slide(0.2, easeInCubic));
    this.refresh();
  }
}
