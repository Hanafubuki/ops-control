import {View2D} from '@revideo/2d';
import {ThreadGenerator, useTime} from '@revideo/core';
import {binders} from './term';

// The per-frame loop. Everything that changes with time (Clawd, spinners, blinking, text
// that follows a signal) is updated from here, driven by the scene clock, so any frame
// renders the same regardless of where playback started.
export class Stage {
  readonly tickers: ((t: number) => void)[] = [];

  constructor(readonly view: View2D) {}

  get size() {
    return this.view.size();
  }

  *run(): ThreadGenerator {
    while (true) {
      const t = useTime();
      for (const f of this.tickers) f(t);
      for (const f of binders) f();
      yield;
    }
  }
}
