import { test, expect } from 'claude-code/testing'
import { validateSheet } from '../hooks/pets.ts'
import { EGG0_SHEET } from '../hooks/sprites/egg0.ts'
import { EGG1_SHEET } from '../hooks/sprites/egg1.ts'
import { EGG2_SHEET } from '../hooks/sprites/egg2.ts'
import { EGG3_SHEET } from '../hooks/sprites/egg3.ts'

const ROWS = ['idle', 'idle2', 'idle3','working', 'walk', 'hop', 'alert', 'done', 'sleep', 'fail', 'dance', 'work-dance']
const SHEETS = [EGG0_SHEET, EGG1_SHEET, EGG2_SHEET, EGG3_SHEET]

test('every egg stage has every row, one size, and a walk that never travels', () => {
  for (const s of SHEETS) {
    expect(() => validateSheet(s)).not.toThrow()
    expect(Object.keys(s.animations).sort()).toEqual([...ROWS].sort())
    expect([s.w, s.h]).toEqual([SHEETS[0]!.w, SHEETS[0]!.h])
    expect(s.animations.walk!.frames.every(f => !f.dx)).toBe(true)
  }
})
