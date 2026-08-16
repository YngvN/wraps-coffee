import { useMemo } from 'react'
import { buildQrGeometry, type QrErrorCorrectionLevel, type QrExcavation } from './qrCodePath'

interface QrCodeSvgProps {
  /** What the code encodes. */
  value: string
  /** The weakest acceptable error-correction level — may be upgraded for free, see `buildQrGeometry`. */
  minLevel: QrErrorCorrectionLevel
  /** Embedded logo image. When set, its box is excavated out of the symbol and it is drawn on top. */
  logoSrc?: string
  /** The logo's size as a fraction of the symbol's own side — flat primitives rather than an object so the memo below cannot be defeated by a caller passing a fresh object literal every render. */
  logoWidthFraction?: number
  logoHeightFraction?: number
  className?: string
}

/**
 * Renders a QR code as a single `<path>` inside a module-coordinate `viewBox`.
 *
 * Replaces `qrcode.react`'s `QRCodeSVG` for the screens feature — see `qrCodePath.ts` for why (that
 * library does not expose its module matrix, so the rounded-run path this draws cannot be built from
 * it). The two admin *login* QR codes still use `qrcode.react`: they have no logo, take the library
 * default level, and never render on the kiosk, so none of the reasons for this component apply.
 *
 * The geometry is memoised on the inputs that change it. Encoding is not free and this sits directly
 * on the stage-transition mount path, which is the whole reason this work exists — a QR pane measured
 * the worst frame cost of any pane kind on the kiosk (see
 * `QA/Reports/mount-stall-step0-2026-08-15.md`).
 *
 * Deliberately no `preserveAspectRatio` override: the square `viewBox` gives the SVG a 1:1 intrinsic
 * ratio, and the default `xMidYMid meet` keeps it square inside a non-square box on its own. The
 * `object-fit: contain` rule this file's `.scss` used to carry existed only to undo `qrcode.react`'s
 * own `preserveAspectRatio="none"`, and went away with it.
 */
export function QrCodeSvg({ value, minLevel, logoSrc, logoWidthFraction = 0, logoHeightFraction = 0, className }: QrCodeSvgProps) {
  const geometry = useMemo(() => {
    if (!logoSrc) return buildQrGeometry(value, minLevel)
    // The excavation has to be expressed in modules, which are only known once the symbol has been
    // encoded — so encode once to learn the module count, then again with the box that implies. The
    // extra encode is cheap next to the path rasterisation this whole component exists to reduce, and
    // it keeps the logo a fixed fraction of the code whatever version the URL happens to need.
    const probe = buildQrGeometry(value, minLevel)
    const width = probe.moduleCount * logoWidthFraction
    const height = probe.moduleCount * logoHeightFraction
    // Rounded outward to whole modules: a module left half-covered would paint as a partial dark
    // cell, which is precisely what a decoder cannot resolve either way.
    const excavation: QrExcavation = {
      x: Math.floor((probe.moduleCount - width) / 2),
      y: Math.floor((probe.moduleCount - height) / 2),
      width: Math.ceil(width) + 1,
      height: Math.ceil(height) + 1,
    }
    return buildQrGeometry(value, minLevel, excavation)
  }, [value, minLevel, logoSrc, logoWidthFraction, logoHeightFraction])

  const { moduleCount, path } = geometry
  const logoWidth = moduleCount * logoWidthFraction
  const logoHeight = moduleCount * logoHeightFraction

  return (
    <svg className={className} viewBox={`0 0 ${moduleCount} ${moduleCount}`} role="img">
      {/* `evenodd` so the finder patterns' middle ring renders as a hole rather than being filled in
          (see `finderPattern`). Module runs never overlap each other, so it changes nothing else. */}
      <path d={path} fill="currentColor" fillRule="evenodd" />
      {logoSrc && (
        <image
          href={logoSrc}
          x={(moduleCount - logoWidth) / 2}
          y={(moduleCount - logoHeight) / 2}
          width={logoWidth}
          height={logoHeight}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
    </svg>
  )
}
