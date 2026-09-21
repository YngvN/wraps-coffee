import './StatusDot.scss'

/**
 * The four severity buckets a status dot can show, named after what they
 * *mean* rather than after their colour so a caller reads as intent
 * (`'inactive'`) rather than as styling (`'red'`). Kept as the original
 * Integrations vocabulary — `active`/`stale`/`inactive`/`disabled` — since
 * both callers map onto it cleanly: Integrations by connection health, the
 * Display Manager by heartbeat age (see `resolveDisplayConnectionStatus`).
 */
export type StatusDotStatus = 'active' | 'stale' | 'inactive' | 'disabled'

interface StatusDotProps {
  status: StatusDotStatus
  /**
   * Accessible name for the state this dot conveys, e.g. "Online". A dot is
   * pure colour, so without this the state is invisible to a screen reader
   * and to anyone who can't distinguish the hues. Omit it *only* when an
   * adjacent visible label already says the same thing, in which case the
   * dot is decorative and is hidden from the accessibility tree.
   */
  label?: string
  /** Native hover tooltip. Usually the same text as `label` — pass both to get a tooltip for mouse users and a name for assistive tech. */
  title?: string
  className?: string
}

/** A small coloured dot conveying one thing's health at a glance — used by the Integrations list and by the Display Manager's own connection indicator. */
export function StatusDot({ status, label, title, className }: StatusDotProps) {
  const classes = ['status-dot', `status-dot--${status}`, className].filter(Boolean).join(' ')
  return <span className={classes} title={title} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
}
