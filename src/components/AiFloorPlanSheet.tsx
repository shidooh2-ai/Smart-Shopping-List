import { useRef, useState } from 'react'
import {
  fileToAnalyzableImage,
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
      setError('Anthropic の APIキーを入力してください。')
      return
    }
    setStoredApiKey(key)
    setStatus('analyzing')
    setError(null)
    try {
      const [{ analyzeFloorPlan }, image] = await Promise.all([
        import('../lib/aiFloorPlanClient'),
        fileToAnalyzableImage(file),
      ])
      const result = await analyzeFloorPlan({ apiKey: key, imageBase64: image.base64, mediaType: image.mediaType })
      const grid = pickGridSize(image.width, image.height)
      const layout = rasterizeFloorPlan(result, grid.width, grid.height, floorId, categories)
      onGenerated(layout)
      close()
    } catch (e) {
      setStatus('error')
      setError(describeError(e))
    }
  }

  return (
    <Sheet open={open} title="見取り図から自動生成" onClose={close}>
      <p className="muted" style={{ marginTop: 0 }}>
        店内の見取り図を撮影・アップロードすると、AI (Claude) が棚・通路・入口・レジなどを読み取って自動配置します。今のフロアの内容は上書きされます（「元に戻す」で戻せます）。
      </p>

      <label className="field">
        <span>Anthropic APIキー</span>
        <input
          type="password"
          value={apiKey}
          placeholder="sk-ant-..."
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="muted" style={{ marginTop: -6 }}>
        この端末にのみ保存され、画像とともに Anthropic の API に直接送信されます（アプリの開発者には送信されません）。
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ marginLeft: 4 }}>
          APIキーを取得
        </a>
      </p>

      <label className="field">
        <span>見取り図の画像</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {preview && (
        <img
          src={preview}
          alt="選択した見取り図のプレビュー"
          style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 12 }}
        />
      )}

      {status === 'analyzing' && <p className="muted">画像を解析しています…（数十秒かかることがあります）</p>}
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
    </Sheet>
  )
}

function describeError(e: unknown): string {
  if (e && typeof e === 'object' && 'status' in e) {
    const status = (e as { status?: number }).status
    if (status === 401) return 'APIキーが正しくないようです。Anthropic Consoleで確認してください。'
    if (status === 429) return 'APIの利用上限に達しました。しばらく待ってから再試行してください。'
  }
  const message = e instanceof Error ? e.message : String(e)
  return `生成に失敗しました: ${message}`
}
