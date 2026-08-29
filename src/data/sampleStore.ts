import { type AsciiFloorSpec, buildStoreFromAscii } from '../lib/layout'
import type { StoreMap } from '../types'

/**
 * 初回起動時に入っているサンプル店舗 (2階建て)。
 * '.' = 通路, '#' = 壁, 英字 = 商品棚, E/C/S/V = 入口/レジ/階段/エレベーター。
 */
const FLOOR_1: AsciiFloorSpec = {
  name: '1F',
  level: 1,
  rows: [
    '#################',
    '#.aaaaaaa.bbbbb.#',
    '#...............#',
    '#.ccccc...ddddd.#',
    '#...............#',
    '#.jj.kk.ll.mm.o.#',
    '#.jj.kk.ll.mm.o.#',
    '#.jj.kk.ll.mm.o.#',
    '#...............#',
    '#.ggggg...hhhhh.#',
    '#...............#',
    '#.eee.fff.ii.nn.#',
    '#...............#',
    '#ECC.........S.V#',
    '#################',
  ],
  shelves: {
    a: { name: '青果コーナー', categoryIds: ['veg'] },
    b: { name: '果物コーナー', categoryIds: ['fruit'] },
    c: { name: '精肉ケース', categoryIds: ['meat'] },
    d: { name: '鮮魚ケース', categoryIds: ['fish'] },
    e: { name: '惣菜コーナー', categoryIds: ['deli'] },
    f: { name: 'ベーカリー', categoryIds: ['bread'] },
    i: { name: '冷凍ケース', categoryIds: ['frozen'] },
    g: { name: '乳製品ケース', categoryIds: ['dairy'] },
    h: { name: '日配ケース', categoryIds: ['chilled'] },
    j: { name: '3番通路 調味料', categoryIds: ['season'] },
    k: { name: '4番通路 乾物・粉', categoryIds: ['dry'] },
    l: { name: '5番通路 レトルト・麺', categoryIds: ['canned', 'noodle'] },
    m: { name: '6番通路 お菓子', categoryIds: ['snack'] },
    n: { name: '飲料ケース', categoryIds: ['drink'] },
    o: { name: '米売場', categoryIds: ['rice'] },
  },
  nodes: {
    E: { kind: 'entrance', name: '入口' },
    C: { kind: 'checkout', name: 'レジ' },
    S: { kind: 'stairs', name: '階段', groupId: 'stairs-a' },
    V: { kind: 'elevator', name: 'エレベーター', groupId: 'elevator-a' },
  },
}

const FLOOR_2: AsciiFloorSpec = {
  name: '2F',
  level: 2,
  rows: [
    '#################',
    '#.ppppp...qqqqq.#',
    '#...............#',
    '#.rrrrr...sssss.#',
    '#...............#',
    '#.ttt..uuu..www.#',
    '#.ttt..uuu..www.#',
    '#...............#',
    '#............S.V#',
    '#################',
  ],
  shelves: {
    p: { name: '日用品売場', categoryIds: ['household'] },
    q: { name: '洗剤・掃除用品', categoryIds: ['detergent'] },
    r: { name: 'トイレタリー', categoryIds: ['toiletry'] },
    s: { name: 'ベビー用品', categoryIds: ['baby'] },
    t: { name: 'ペット用品', categoryIds: ['pet'] },
    u: { name: '健康・医薬品', categoryIds: ['medicine'] },
    w: { name: '酒売場', categoryIds: ['alcohol'] },
  },
  nodes: {
    S: { kind: 'stairs', name: '階段', groupId: 'stairs-a' },
    V: { kind: 'elevator', name: 'エレベーター', groupId: 'elevator-a' },
  },
}

export function createSampleStore(): StoreMap {
  return buildStoreFromAscii('サンプルスーパー 中央店', [FLOOR_1, FLOOR_2], 1.2)
}
