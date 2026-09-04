import { describe, expect, it } from 'vitest'
import type { ListActivityEvent } from '../types'
import {
  appendActivity,
  describeActivityEvent,
  isNotificationEnabled,
  newActivitySince,
  notifiableEvents,
  summarizeItemTexts,
} from './listActivity'

const event = (id: string, kind: ListActivityEvent['kind'] = 'add'): ListActivityEvent => ({
  id,
  kind,
  itemText: '牛乳',
  by: 'たろう',
  at: 0,
})

describe('appendActivity', () => {
  it('新しい変更を末尾に積む', () => {
    const activity = appendActivity(undefined, 'add', '牛乳', 'たろう')
    expect(activity).toHaveLength(1)
    expect(activity[0]).toMatchObject({ kind: 'add', itemText: '牛乳', by: 'たろう' })
  })

  it('毎回違うIDを発行する (同じ変更として扱われないように)', () => {
    let activity = appendActivity(undefined, 'add', 'A', null)
    activity = appendActivity(activity, 'add', 'B', null)
    expect(activity[0].id).not.toBe(activity[1].id)
  })

  it('上限 (30件) を超えたら古いものから切り詰める', () => {
    let activity: ListActivityEvent[] | undefined
    for (let i = 0; i < 35; i++) activity = appendActivity(activity, 'add', `item${i}`, null)
    expect(activity).toHaveLength(30)
    expect(activity![0].itemText).toBe('item5')
    expect(activity![29].itemText).toBe('item34')
  })
})

describe('summarizeItemTexts', () => {
  it('1件ならそのまま、複数件なら件数を添える', () => {
    expect(summarizeItemTexts([])).toBe('')
    expect(summarizeItemTexts(['牛乳'])).toBe('牛乳')
    expect(summarizeItemTexts(['牛乳', 'パン', '卵'])).toBe('牛乳 他2件')
  })
})

describe('newActivitySince', () => {
  it('ローカルにまだ無いidだけを返す', () => {
    const local = [event('a'), event('b')]
    const remote = [event('a'), event('b'), event('c')]
    expect(newActivitySince(local, remote).map((e) => e.id)).toEqual(['c'])
  })

  it('自分がこの端末で行った変更は、pull前に既にローカルへ入っているので混ざらない', () => {
    // ローカルで先に追加された変更 (id: 'mine') は remote 側にも同じidで返ってくる想定
    const local = [event('mine')]
    const remote = [event('mine')]
    expect(newActivitySince(local, remote)).toEqual([])
  })

  it('remoteが空/未設定なら何も無い', () => {
    expect(newActivitySince([event('a')], undefined)).toEqual([])
    expect(newActivitySince([event('a')], [])).toEqual([])
  })

  it('ローカルの履歴が空でも動く (共有直後の初回pullなど)', () => {
    expect(newActivitySince(undefined, [event('a')]).map((e) => e.id)).toEqual(['a'])
  })
})

describe('isNotificationEnabled / notifiableEvents', () => {
  it('未設定ならすべて有効', () => {
    expect(isNotificationEnabled(undefined, 'add')).toBe(true)
    expect(isNotificationEnabled(undefined, 'remove')).toBe(true)
    expect(isNotificationEnabled(undefined, 'purchase')).toBe(true)
  })

  it('種類ごとの設定に従う', () => {
    const prefs = { onAdd: true, onRemove: false, onPurchase: true }
    expect(isNotificationEnabled(prefs, 'add')).toBe(true)
    expect(isNotificationEnabled(prefs, 'remove')).toBe(false)
    expect(isNotificationEnabled(prefs, 'purchase')).toBe(true)
  })

  it('notifiableEvents はオフの種類を除外する', () => {
    const list = { notifications: { onAdd: true, onRemove: false, onPurchase: true } }
    const events = [event('a', 'add'), event('b', 'remove'), event('c', 'purchase')]
    expect(notifiableEvents(list, events).map((e) => e.id)).toEqual(['a', 'c'])
  })
})

describe('describeActivityEvent', () => {
  it('操作した人が分かれば名前入りの文にする', () => {
    expect(describeActivityEvent(event('a', 'add'))).toBe('たろうさんが「牛乳」を追加しました')
    expect(describeActivityEvent(event('a', 'remove'))).toBe('たろうさんが「牛乳」を削除しました')
    expect(describeActivityEvent(event('a', 'purchase'))).toBe('たろうさんが「牛乳」を購入済みへ移動しました')
  })

  it('操作した人が分からなければ「誰かが」にする', () => {
    expect(describeActivityEvent({ ...event('a'), by: null })).toBe('誰かが「牛乳」を追加しました')
  })
})
