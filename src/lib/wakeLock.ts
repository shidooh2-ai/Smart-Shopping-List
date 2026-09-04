import { useEffect } from 'react'

/** Screen Wake Lock API に対応しているか (iOS Safari 16.4+ など)。非対応の端末では設定を無効化する。 */
export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

/**
 * enabled の間、画面が自動でスリープ/暗転しないようにする。
 * タブ切り替えなどで一旦解放された場合、フォアグラウンドに戻ったタイミングで再取得する。
 */
export function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !isWakeLockSupported()) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        // 低電力モードなど、端末側の事情で拒否されることがある。何もしない
      }
    }

    const onVisibilityChange = () => {
      if (!cancelled && document.visibilityState === 'visible' && sentinel === null) {
        void acquire()
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void sentinel?.release()
      sentinel = null
    }
  }, [enabled])
}
