import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState } from 'react'
import { Alert } from '../../../components'
import { useLanguage } from '../../../i18n'
import { parsePairingApprovalQrValue } from '../../../lib/pairingQr'
import './QrPairingScanner.scss'

interface QrPairingScannerProps {
  onScanned: (result: { machineID: string; pin: string }) => void
}

/**
 * Opens the browser's camera and decodes the `adhdisplay-companion-approve://v1?...`
 * QR code `PairingScreen.tsx` (adhdisplay-companion) shows alongside its
 * PIN — a shortcut for typing that PIN into the "Connect with PIN" flow,
 * not a separate approval mechanism (see `DisplayManagerView.tsx`, which
 * feeds a successful scan straight into the same `approveDisplayPairing`
 * call the manual form uses). A QR belonging to some other app entirely is
 * reported inline rather than silently ignored, so a wrong scan doesn't
 * look like the camera just isn't seeing anything.
 */
export function QrPairingScanner({ onScanned }: QrPairingScannerProps) {
  const { t } = useLanguage()
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasScannedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const scanner = new QrScanner(
      video,
      (result) => {
        if (hasScannedRef.current) return
        const parsed = parsePairingApprovalQrValue(result.data)
        if (!parsed) {
          setError(t('admin.displayManager.scanQrUnrecognized'))
          return
        }
        hasScannedRef.current = true
        onScanned(parsed)
      },
      { returnDetailedScanResult: true, highlightScanRegion: true },
    )

    scanner.start().catch(() => setError(t('admin.displayManager.scanQrPermissionDenied')))

    return () => {
      scanner.stop()
      scanner.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="qr-pairing-scanner">
      <video ref={videoRef} className="qr-pairing-scanner__video" muted playsInline />
      <p className="qr-pairing-scanner__instructions">{t('admin.displayManager.scanQrInstructions')}</p>
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  )
}
