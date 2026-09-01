import { GoogleGenAI, Type } from '@google/genai'
import type { GenerateContentResponse } from '@google/genai'
import type { FloorPlanResult } from './aiFloorPlan'

/**
 * Google Gemini SDK を使う部分だけを分離したモジュール。
 * バンドルの初期読み込みを軽くするため、AI機能を実際に使う時だけ
 * 動的 import() で読み込む (AiFloorPlanSheet 参照)。
 *
 * 無料枠のある Gemini API を使う (Anthropic Claude には常設の無料枠が無いため)。
 */

/**
 * 無料枠を持つ Gemini Flash モデル。画像入力・JSON構造化出力に対応。
 * 個別バージョンを固定すると新規ユーザー向け提供終了で 404 になることがあるため
 * (実際に gemini-2.5-flash で発生)、Google が指す先を自動更新する
 * floating alias を使う。
 *
 * 最新の flash モデルは公開直後で混雑しやすく 503 (高負荷) が続くことがあるため、
 * より軽量で空いていることが多い flash-lite を先に試し、それでも503が続く場合だけ
 * 通常の flash にフォールバックする (analyzeFloorPlan 参照)。
 */
export const GEMINI_MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest'] as const

const ZONE_KINDS = ['wall', 'shelf', 'aisle', 'entrance', 'checkout', 'stairs', 'elevator'] as const

/**
 * Gemini の構造化出力には responseJsonSchema (新しめ) と responseSchema (旧来の
 * OpenAPIサブセット、Type enum ベース) の2方式があるが、後者の方が対応が古く
 * 安定しているため、実際に "Request contains an invalid argument" で失敗した
 * responseJsonSchema 方式から乗り換えた。
 */
const ZONE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    zones: {
      type: Type.ARRAY,
      description: '画像から読み取った区画の一覧。重なった場合は配列の後の方が優先される',
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            format: 'enum',
            enum: [...ZONE_KINDS],
            description: 'この区画の種類',
          },
          x0: { type: Type.NUMBER, minimum: 0, maximum: 1, description: '区画左端のX座標 (画像幅を1とした比率、左端=0)' },
          y0: { type: Type.NUMBER, minimum: 0, maximum: 1, description: '区画上端のY座標 (画像高さを1とした比率、上端=0)' },
          x1: { type: Type.NUMBER, minimum: 0, maximum: 1, description: '区画右端のX座標' },
          y1: { type: Type.NUMBER, minimum: 0, maximum: 1, description: '区画下端のY座標' },
          label: {
            type: Type.STRING,
            description:
              'その区画に書かれている文字・記号があればそのまま書き写す (例: "青果", "レジ", "1番レジ")。無ければ省略。',
          },
        },
        required: ['kind', 'x0', 'y0', 'x1', 'y1'],
      },
    },
  },
  required: ['zones'],
} as const

const PROMPT = `これはスーパーマーケットの店舗見取り図（手描き・印刷・CADいずれも可）の画像です。
画像全体を横1.0×縦1.0とした相対座標（左上が(0,0)、右下が(1,1)）で、次の種類の区画をすべて矩形として書き出してください。

- wall: 壁・外周・柱など、通行も陳列もできない場所
- shelf: 商品棚・什器・レジ台の陳列スペースなど、商品が置かれている場所
- aisle: 通路。棚の間の通行スペースを明示したいときや、棚の中に通路が切れ込んでいる場合に使う
- entrance: 入口・出入口
- checkout: レジ
- stairs: 階段
- elevator: エレベーター

注意事項:
- 棚や区画に書かれている文字・記号（「青果」「精肉」「①」など）があれば label にそのまま書き写してください。読み取れない・何も書かれていない場合は label を省略してください。
- 通路や什器のない空間は自動的に通路として扱われるので、余白をすべて aisle で埋める必要はありません。棚と棚の間の明確な通路だけ書いてもらえれば十分です。
- 壁は見取り図の外周や間仕切りの線に沿って、細長い矩形として表現してください。
- 座標は画像の見た目どおりの位置にしてください。実物の縮尺や角度の補正は不要です。
- 見取り図に写っていない要素は書かないでください。
- 必ず指定された JSON 形式だけで答えてください。`

export interface AnalyzeFloorPlanOptions {
  apiKey: string
  imageBase64: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
}

function describeGeminiError(status: number | undefined, message: string): Error {
  if (status === 401 || status === 403 || /api key not valid|api_key_invalid/i.test(message)) {
    return new Error('APIキーが正しくないようです。Google AI Studio で確認してください。')
  }
  if (status === 429) {
    return new Error('無料枠の利用上限に達しました。しばらく待ってから再試行してください。')
  }
  if (status === 404 || /is not found|no longer available/i.test(message)) {
    return new Error('AIモデルが利用できなくなっているようです。アプリの更新をお待ちいただくか、開発者にご連絡ください。')
  }
  if (status === 503 || /unavailable|overloaded|high demand/i.test(message)) {
    return new Error(
      'Geminiサーバーが混み合っているようです。無料枠のモデルはGoogle側の負荷が高い時間帯があり、公開直後のモデルでは数時間〜1日程度続くこともあります。時間をおいて再試行してください。',
    )
  }
  // 400 はキー以外の原因 (リクエスト内容の問題など) のこともあるため、
  // 実際のエラー内容をそのまま出す (原因の特定・報告に必要)。
  return new Error(`生成に失敗しました (${status ?? '?'}): ${message}`)
}

function statusOf(e: unknown): number | undefined {
  return e && typeof e === 'object' && 'status' in e ? Number((e as { status?: unknown }).status) : undefined
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 無料枠のFlashモデルは混雑時に一時的な503を返しやすいため、モデルごとに短い間隔で数回だけ自動再試行する。
const RETRY_DELAYS_MS = [1500, 3000]

type ModelAttemptResult =
  | { ok: true; response: GenerateContentResponse }
  | { ok: false; status: number | undefined; message: string }

/** 1つのモデルに対して、再試行しても良い間 (503など) は自動で試す。それ以外の失敗は即座にthrowする。 */
async function generateWithModel(
  client: GoogleGenAI,
  model: string,
  opts: AnalyzeFloorPlanOptions,
): Promise<ModelAttemptResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: opts.imageBase64, mimeType: opts.mediaType } },
              { text: PROMPT },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: ZONE_SCHEMA,
        },
      })
      return { ok: true, response }
    } catch (e) {
      const status = statusOf(e)
      const message = e instanceof Error ? e.message : String(e)
      const retryable = status === 503 || /unavailable|overloaded/i.test(message)
      if (!retryable) throw describeGeminiError(status, message)
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      return { ok: false, status, message }
    }
  }
}

/** Gemini に見取り図画像を渡し、区画一覧を構造化データとして受け取る。 */
export async function analyzeFloorPlan(opts: AnalyzeFloorPlanOptions): Promise<FloorPlanResult> {
  const client = new GoogleGenAI({ apiKey: opts.apiKey })
  let response: GenerateContentResponse | null = null
  let lastFailure: { status: number | undefined; message: string } | null = null
  // 1つのモデルが混雑していても別のモデルは空いていることがあるため、順番に試す。
  for (const model of GEMINI_MODELS) {
    const result = await generateWithModel(client, model, opts)
    if (result.ok) {
      response = result.response
      break
    }
    lastFailure = result
  }
  if (!response) {
    throw describeGeminiError(lastFailure?.status, lastFailure?.message ?? '不明なエラー')
  }

  const text = response.text
  if (!text) {
    throw new Error('画像をうまく読み取れませんでした。もう一度お試しください。')
  }
  try {
    return JSON.parse(text) as FloorPlanResult
  } catch {
    throw new Error('AIの応答を解析できませんでした。もう一度お試しください。')
  }
}
