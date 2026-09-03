import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kaimonoroute.app',
  appName: 'かいものルート',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
  },
}

export default config
