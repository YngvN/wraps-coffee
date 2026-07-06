import { Card, Input } from '../../../components'
import { useRatings } from '../../../hooks/useRatings'
import { useLanguage } from '../../../i18n'
import './RatingsEditor.scss'

/** Editor for the 4 fixed third-party rating platforms — only the score is editable, not the platform list. */
export function RatingsEditor() {
  const { t } = useLanguage()
  const [ratings, setRatings] = useRatings()

  const updateRating = (platform: string, rating: number) => {
    setRatings(ratings.map((entry) => (entry.platform === platform ? { ...entry, rating } : entry)))
  }

  return (
    <Card title={t('admin.reviews.ratingsTitle')}>
      <div className="ratings-editor">
        {ratings.map((entry) => (
          <Input
            key={entry.platform}
            id={`rating-${entry.platform}`}
            label={entry.platform}
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={entry.rating}
            onChange={(event) => updateRating(entry.platform, Number(event.target.value))}
          />
        ))}
      </div>
    </Card>
  )
}
