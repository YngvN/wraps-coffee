import { useRef } from 'react'
import { useLanguage } from '../../i18n'
import type { SplitDirection } from '../../types/screen'
import './PaneSplitZones.scss'

interface PaneSplitZonesProps {
  /** `edge` is which side of the middle line the new pane lands on ('start': left/top; 'end': right/bottom) — decided from the actual click position relative to the pane's own center, not which piece was clicked (see this component's own doc comment). The split itself is always an even 50/50 (see `splitLeaf`). */
  onSplit: (axis: SplitDirection, edge: 'start' | 'end') => void
  /** Makes the zone pieces themselves untappable (not just their hover preview) on a touch-only device — see `PaneSplitZones.scss`. Only set by `ScreenForm.tsx`'s own preview, which has explicit "Split pane horizontally"/"Split pane vertically" buttons underneath as a substitute; omit (as `ScreenDisplay.tsx`'s live editing overlay does) where tapping the preview is the only way to split at all. */
  disableOnTouch?: boolean
}

type Piece = 'north' | 'south' | 'west' | 'east'

const PIECE_AXIS: Record<Piece, SplitDirection> = {
  north: 'row',
  south: 'row',
  west: 'column',
  east: 'column',
}

/**
 * Since a split is always an even 50/50 (see `splitLeaf`), a pane's own
 * "invisible border" sits exactly on its own middle — a vertical line for a
 * prospective 'row' (left/right) split, a horizontal one for a 'column'
 * (top/bottom) split. Hovering close to either middle line reveals it: a
 * hollow "plus" of 4 narrow band pieces (see `PaneSplitZones.scss`) —
 * north/south flank the vertical line (narrow in x, tall in y), west/east
 * flank the horizontal one (narrow in y, tall in x). Dead center, where
 * both lines would cross, is deliberately left uncovered by any piece, so
 * hovering/clicking there falls straight through to `PaneEditButton`
 * beneath it — "just highlight the pane as clickable" for free, no extra
 * code needed here. Which side of the line the new pane lands on is
 * decided from the actual click position (left/right of the vertical line
 * for a row split, above/below the horizontal one for a column split), not
 * which piece was clicked — north and south, for instance, both flank the
 * *same* vertical line and don't inherently know which side of it either.
 */
export function PaneSplitZones({ onSplit, disableOnTouch }: PaneSplitZonesProps) {
  const { t } = useLanguage()
  const containerRef = useRef<HTMLDivElement>(null)

  const handleClick = (piece: Piece) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const axis = PIECE_AXIS[piece]
    const rect = containerRef.current?.getBoundingClientRect()
    const edge: 'start' | 'end' = rect
      ? axis === 'row'
        ? event.clientX - rect.left < rect.width / 2
          ? 'start'
          : 'end'
        : event.clientY - rect.top < rect.height / 2
          ? 'start'
          : 'end'
      : 'end'
    onSplit(axis, edge)
  }

  return (
    <div ref={containerRef} className={`pane-split-zones${disableOnTouch ? ' pane-split-zones--touch-disabled' : ''}`}>
      {(['north', 'south', 'west', 'east'] as Piece[]).map((piece) => (
        <button
          key={piece}
          type="button"
          className={`pane-split-zone pane-split-zone--${piece}`}
          aria-label={t(PIECE_AXIS[piece] === 'row' ? 'admin.screens.splitPaneHorizontallyButton' : 'admin.screens.splitPaneVerticallyButton')}
          onClick={handleClick(piece)}
        />
      ))}
      <span className="pane-split-zones__row-line" />
      <span className="pane-split-zones__column-line" />
      <span className="pane-split-zones__label">{t('admin.screens.splitPaneLabel')}</span>
    </div>
  )
}
