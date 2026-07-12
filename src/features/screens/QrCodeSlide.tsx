import { QRCodeSVG } from 'qrcode.react'
import { DEFAULT_QR_CODE_SIZE } from '../../types/screen'
import './QrCodeSlide.scss'

interface QrCodeSlideProps {
  url: string
  /** Percentage (`MIN_QR_CODE_SIZE`-100) of the pane's own available space the code fills. Falls back to `DEFAULT_QR_CODE_SIZE`. */
  size?: number
}

/**
 * Fullscreen, centered QR code linking to an admin-typed URL, for a screen
 * display's "QR code" slot. Deliberately not the usual white-square/black-
 * modules look — `bgColor="transparent"` and `fgColor="currentColor"` draw
 * only the dark modules, in whichever of black/white this pane's own
 * contrast-based `--screen-text` resolves to (see `getScreenColorVars`), so
 * it reads as part of the pane rather than a pasted-in white sticker.
 * Renders nothing until a URL is set, same "unconfigured → blank" posture
 * as `'image'`/`'transit'`.
 */
export function QrCodeSlide({ url, size }: QrCodeSlideProps) {
  if (!url) return null

  const sizePercent = `${size ?? DEFAULT_QR_CODE_SIZE}%`

  return (
    <div className="qr-code-slide">
      <QRCodeSVG value={url} bgColor="transparent" fgColor="currentColor" className="qr-code-slide__code" style={{ width: sizePercent, height: sizePercent }} />
    </div>
  )
}
