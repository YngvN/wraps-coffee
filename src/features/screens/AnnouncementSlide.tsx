import './AnnouncementSlide.scss'

interface AnnouncementSlideProps {
  title: string
  description: string
}

/** Fullscreen, centered rendering of a short admin-authored call-to-action — a title (e.g. "Buy tickets now!") and an optional description below it, written once in whichever single language the owner typed it in — for a screen display's "Custom message" slot, unrelated to the menu/events/message-board systems. */
export function AnnouncementSlide({ title, description }: AnnouncementSlideProps) {
  return (
    <div className="announcement-slide">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  )
}
