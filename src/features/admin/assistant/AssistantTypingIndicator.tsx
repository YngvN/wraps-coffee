interface AssistantTypingIndicatorProps {
  /** Short phase label shown next to the dots (e.g. "Thinking…", "Double-checking…") — see the plan's per-step status note, so a multi-round-trip operation reads as visible progress rather than one long, unexplained pause. */
  label: string
}

/** Three dots pulsing in sequence, shown in the chat log while any assistant request is in flight — pure CSS keyframe animation (see `AssistantPanel.scss`), respects `prefers-reduced-motion`. */
export function AssistantTypingIndicator({ label }: AssistantTypingIndicatorProps) {
  return (
    <div className="assistant-typing-indicator" role="status">
      <span className="assistant-typing-indicator__dots">
        <span />
        <span />
        <span />
      </span>
      <span className="assistant-typing-indicator__label">{label}</span>
    </div>
  )
}
