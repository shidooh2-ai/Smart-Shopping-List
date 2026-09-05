import { describe, expect, it } from 'vitest'
import { EFFECTS, type EffectId, effectStyle, isEffectId } from './effects'

describe('EFFECTS', () => {
  it('IDが重複していない', () => {
    const ids = EFFECTS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('先頭は default (未知のIDのフォールバック先になるため)', () => {
    expect(EFFECTS[0].id).toBe('default')
  })

  it('粒を出すエフェクトには必ず色が定義されている', () => {
    for (const e of EFFECTS) {
      if (e.completeCount > 0) expect(e.colors.length).toBeGreaterThan(0)
    }
  })

  it('演出の長さは、粒を出すなら0より大きい', () => {
    for (const e of EFFECTS) {
      if (e.checkCount > 0) expect(e.checkDurationMs).toBeGreaterThan(0)
      if (e.completeCount > 0) expect(e.completeDurationMs).toBeGreaterThan(0)
    }
  })

  it('ラベルと説明が入っている', () => {
    for (const e of EFFECTS) {
      expect(e.label.length).toBeGreaterThan(0)
      expect(e.description.length).toBeGreaterThan(0)
    }
  })
})

describe('isEffectId', () => {
  it('現在のIDを受け付ける', () => {
    expect(isEffectId('petals')).toBe(true)
    expect(isEffectId('fireworks')).toBe(true)
    expect(isEffectId('minimal')).toBe(true)
  })

  it('作り直しで無くなった旧ID (sparkle) や未知の値は弾く', () => {
    // ストアの migrate (v1→v2) がこれを見てデフォルトに戻す
    expect(isEffectId('sparkle')).toBe(false)
    expect(isEffectId('')).toBe(false)
    expect(isEffectId(undefined)).toBe(false)
    expect(isEffectId(null)).toBe(false)
    expect(isEffectId(3)).toBe(false)
  })
})

describe('effectStyle', () => {
  it('IDに対応する設定を返す', () => {
    expect(effectStyle('balloons').label).toBe('風船')
  })

  it('未知のIDならデフォルトにフォールバックする', () => {
    expect(effectStyle('sparkle' as EffectId).id).toBe('default')
  })
})
