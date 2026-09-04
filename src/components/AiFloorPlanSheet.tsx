import { useRef, useState } from 'react'
import {
  fileToAnalyzableImage,
  fileToBackgroundImage,
  getStoredApiKey,
  pickGridSize,
  rasterizeFloorPlan,
  setStoredApiKey,
} from '../lib/aiFloorPlan'
import type { Category } from '../types'
import { Sheet } from './Sheet'

export interface FloorPlanGenerateResult {
  width: number
  height: number
  cells: ReturnType<typeof rasterizeFloorPlan>['cells']
  shelves: ReturnType<typeof rasterizeFloorPlan>['shelves']
  nodes: ReturnType<typeof rasterizeFloorPlan>['nodes']
  /** 編集時の参考として重ねて表示できる、元の見取り図画像 (dataURL) */
  backgroundImage: string
}

export interface AiFloorPlanSheetProps {
  open: boolean
  onClose: () => void
  categories: Category[]
  floorId: string
  onGenerated: (result: FloorPlanGenerateResult) => void
}

type Status = 'idle' | 'analyzing' | 'error'

/** 見取り図の写真から棚・通路・設備をAIに自動配置させるシート。 */
export function AiFloorPlanSheet({ open, onClose, categories, floorId, onGenerated }: AiFloorPlanSheetProps) {
  const [apiKey, setApiKey] = useState(() => getStoredApiKey())
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const reset = () => {
    setPreview(null)
    setFile(null)
    setStatus('idle')
    setError(null)
  }

  const close = () => {
    reset()
    onClose()
  }

  const pickFile = (f: File | null) => {
    if (!f) return
    setFile(f)
    setError(null)
    const url = URL.createObjectURL(f)
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return url
    })
  }

  const generate = async () => {
    if (!file) return
    const key = apiKey.trim()
    if (!key) {
      setError('Google AI の APIキーを入力してください。')
      return
    }
    setStoredApiKey(key)
    setStatus('analyzing')
    setError(null)
    try {
      const [{ analyzeFloorPlan }, image, backgroundImage] = await Promise.all([
        import('../lib/aiFloorPlanClient'),
        fileToAnalyzableImage(file),
        fileToBackgroundImage(file),
      ])
      const result = await analyzeFloorPlan({ apiKey: key, imageBase64: image.base64, mediaType: image.mediaType })
      const grid = pickGridSize(image.width, image.height)
      const layout = rasterizeFloorPlan(result, grid.width, grid.height, floorId, categories)
      onGenerated({ ...layout, backgroundImage })
      close()
    } catch (e) {
      setStatus('error')
      setError(describeError(e))
    }
  }

  return (
    <Sheet
      open={open}
      title="見取り図から自動生成"
      onClose={close}
      footer={
        <>
          {status === 'analyzing' && (
            <p className="muted" style={{ marginTop: 0 }}>
              画像を解析しています…（数十秒かかることがあります）
            </p>
          )}
          {error && <div className="banner">{error}</div>}
          <button
            type="button"
            className="btn primary"
            style={{ width: '100%' }}
            disabled={!file || status === 'analyzing'}
            onClick={() => void generate()}
          >
            {status === 'analyzing' ? '生成中…' : 'この画像から生成する'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        店内の見取り図を撮影・アップロードすると、AI (Google Gemini) が棚・通路・入口・レジなどを読み取って自動配置します。今のフロアの内容は上書きされます（「元に戻す」で戻せます）。無料枠のあるモデルを使うので、通常の利用なら課金なしで試せます。
      </p>

      <label className="field">
        <span>Google AI (Gemini) APIキー</span>
        <input
          type="password"
          value={apiKey}
          placeholder="AIza..."
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="muted" style={{ marginTop: -6 }}>
        この端末にのみ保存され、画像とともに Google の API に直接送信されます（アプリの開発者には送信されません）。Google
        アカウントがあればクレジットカード登録なしで無料取得できます。
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ marginLeft: 4 }}>
          APIキーを取得
        </a>
      </p>

      <label className="field">
        <span>見取り図の画像</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {preview && (
        <img
          src={preview}
          alt="選択した見取り図のプレビュー"
          style={{
            display: 'block',
            width: '100%',
            maxHeight: '40vh',
            objectFit: 'contain',
            borderRadius: 10,
            border: '1px solid var(--border)',
            marginBottom: 12,
            background: 'var(--surface-2)',
          }}
        />
      )}
    </Sheet>
  )
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : `生成に失敗しました: ${String(e)}`
}
