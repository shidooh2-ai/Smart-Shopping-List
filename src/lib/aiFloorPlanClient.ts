import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { type FloorPlanResult, ZONE_KINDS } from './aiFloorPlan'

/**
 * Anthropic SDK と zod を使う部分だけを分離したモジュール。
 * バンドルの初期読み込みを軽くするため、AI機能を実際に使う時だけ
 * 動的 import() で読み込む (AiFloorPlanSheet 参照)。
 */

const ZoneSchema = z.object({
  kind: z.enum(ZONE_KINDS).describe('この区画の種類'),
  x0: z.number().min(0).max(1).describe('区画左端のX座標 (画像幅を1とした比率、左端=0)'),
  y0: z.number().min(0).max(1).describe('区画上端のY座標 (画像高さを1とした比率、上端=0)'),
  x1: z.number().min(0).max(1).describe('区画右端のX座標'),
  y1: z.number().min(0).max(1).describe('区画下端のY座標'),
  label: z
    .string()
    .optional()
    .describe('その区画に書かれている文字・記号があればそのまま書き写す (例: "青果", "レジ", "1番レジ")。無ければ省略。'),
})

const FloorPlanSchema = z.object({
  zones: z.array(ZoneSchema).max(400).describe('画像から読み取った区画の一覧。重なった場合は配列の後の方が優先される'),
})

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
- 見取り図に写っていない要素は書かないでください。`

export interface AnalyzeFloorPlanOptions {
  apiKey: string
  imageBase64: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
}

/** Claude に見取り図画像を渡し、区画一覧を構造化データとして受け取る。 */
export async function analyzeFloorPlan(opts: AnalyzeFloorPlanOptions): Promise<FloorPlanResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true })
  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: opts.mediaType, data: opts.imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(FloorPlanSchema) },
  })
  if (!response.parsed_output) {
    throw new Error('画像をうまく読み取れませんでした。もう一度お試しください。')
  }
  return response.parsed_output
}
