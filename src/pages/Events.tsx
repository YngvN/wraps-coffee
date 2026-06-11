import coffeeTastingImage from '../assets/images/events/coffee-tasting.svg'
import liveMusicImage from '../assets/images/events/live-music.svg'
import movieNightImage from '../assets/images/events/movie-night.svg'
import poetryNightImage from '../assets/images/events/poetry-night.svg'
import { Card, TranslatedText } from '../components'
import { useLanguage } from '../i18n'
import './Events.scss'

/** Events held at Wraps & Coffee. Placeholder content until real events are scheduled. */
const events = [
  { key: 'poetryNight', image: poetryNightImage },
  { key: 'movieNight', image: movieNightImage },
  { key: 'liveMusic', image: liveMusicImage },
  { key: 'coffeeTasting', image: coffeeTastingImage },
] as const

/** Events page: a list of recurring events held at the cafe. */
export function Events() {
  const { t } = useLanguage()

  return (
    <div className="events">
      <TranslatedText as="h1" id="events.title" />
      <TranslatedText as="p" id="events.intro" />
      <ul className="events__list">
        {events.map(({ key, image }) => (
          <li key={key}>
            <Card className="events__card">
              <img className="events__image" src={image} alt="" />
              <div className="events__details">
                <h2>{t(`events.items.${key}.title`)}</h2>
                <p className="events__date">{t(`events.items.${key}.date`)}</p>
                <p>{t(`events.items.${key}.description`)}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
