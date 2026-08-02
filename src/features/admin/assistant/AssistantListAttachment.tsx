import type { AssistantReplyList } from '../../../lib/localServer'
import './AssistantListAttachment.scss'

interface AssistantListAttachmentProps {
  list: AssistantReplyList
}

/**
 * Renders a lookup reply's structured list of matched records (see
 * `AssistantReplyList`) as a real bullet list beneath the assistant's chat
 * bubble — never inside the bubble itself, so it reads as attached data
 * rather than conversational prose. Each item shows its `label` in normal
 * weight and, if present, its `sublabel` (e.g. a product's category) as
 * muted secondary text. `style` is always `'bullet'` today; `'numbered'` is
 * reserved on the type but has no rendering here yet.
 */
export function AssistantListAttachment({ list }: AssistantListAttachmentProps) {
  return (
    <ul className="assistant-list-attachment">
      {list.items.map((item, index) => (
        <li key={`${item.label}-${index}`}>
          <span className="assistant-list-attachment__label">{item.label}</span>
          {item.sublabel && <span className="assistant-list-attachment__sublabel"> ({item.sublabel})</span>}
        </li>
      ))}
    </ul>
  )
}
