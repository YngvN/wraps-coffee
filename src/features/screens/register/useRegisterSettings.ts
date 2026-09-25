import { useDeviceSetting } from '../orders/useDeviceSetting'
import type { ProductSort } from './productList'

/** The register's own per-tablet preferences (remembered in this tablet's `localStorage`, see `useDeviceSetting`). */
export interface RegisterSettings {
  /** The Scan button (camera scanning on/off, also the privacy switch). Off by default: the camera never runs until staff switch it on. */
  cameraOn: boolean
  setCameraOn: (on: boolean) => void
  /** Whether the small aiming preview is shown while the camera scans. Hidden by default. */
  cameraPreview: boolean
  setCameraPreview: (shown: boolean) => void
  /** Scan sounds (see `scanSound.ts`). On by default. */
  soundOn: boolean
  setSoundOn: (on: boolean) => void
  /** How the product tiles are ordered. Menu order by default. */
  productSort: ProductSort
  setProductSort: (sort: ProductSort) => void
}

const onOff = (fallback: 'on' | 'off') => (stored: string | null) => (stored === 'on' || stored === 'off' ? stored : fallback)

/** Reads and writes the register's per-tablet preferences. */
export function useRegisterSettings(): RegisterSettings {
  const [camera, setCamera] = useDeviceSetting<'on' | 'off'>('register.camera', onOff('off'), 'off')
  const [preview, setPreview] = useDeviceSetting<'on' | 'off'>('register.cameraPreview', onOff('off'), 'off')
  const [sound, setSound] = useDeviceSetting<'on' | 'off'>('register.scanSound', onOff('on'), 'on')
  const [productSort, setProductSort] = useDeviceSetting<ProductSort>('register.productSort', (stored) => (stored === 'name' || stored === 'popular' ? stored : 'menu'), 'menu')
  return {
    cameraOn: camera === 'on',
    setCameraOn: (on) => setCamera(on ? 'on' : 'off'),
    cameraPreview: preview === 'on',
    setCameraPreview: (shown) => setPreview(shown ? 'on' : 'off'),
    soundOn: sound === 'on',
    setSoundOn: (on) => setSound(on ? 'on' : 'off'),
    productSort,
    setProductSort,
  }
}
