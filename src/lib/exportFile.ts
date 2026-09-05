/**
 * JSON書き出し用のファイルを渡す。
 *
 * iPhoneアプリ (Capacitor) では、これまでの `<a download>` + blob URL のやり方だと
 * 「Failed to open URL blob:capacitor://...」(LSApplicationWorkspaceErrorDomain Code=115)
 * になり、何も起きずに失敗する (WKWebView は blob: URL を新規タブで「開く」操作として
 * 扱ってしまい、iOS 側がそれを外部URLとして開こうとして失敗するため)。
 *
 * ファイル付きの共有 (Web Share API Level 2) に対応していればそちらを使う。
 * 共有シートから「ファイルに保存」「AirDropで送る」などを選べ、iPhoneアプリでも
 * 確実に書き出せる。対応していない環境 (デスクトップブラウザなど) では
 * 従来どおりダウンロードリンクにフォールバックする。
 */
export async function exportJsonFile(filename: string, payload: string): Promise<void> {
  const file = new File([payload], filename, { type: 'application/json' })
  const nav = navigator as Navigator & Partial<{ canShare: (data: ShareData) => boolean; share: (data: ShareData) => Promise<void> }>

  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ files: [file] })
      return
    } catch (e) {
      // ユーザーがキャンセルした場合 (AbortError) は何もしない。それ以外はダウンロードにフォールバックする。
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }

  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
