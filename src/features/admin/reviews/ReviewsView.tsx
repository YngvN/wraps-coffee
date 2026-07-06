import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Button, Card, Input, Textarea, TranslatedText } from '../../../components'
import { useReviews } from '../../../hooks/useReviews'
import { useLanguage } from '../../../i18n'
import { RatingsEditor } from './RatingsEditor'
import './ReviewsView.scss'

/** Admin view for editing customer reviews (per language) and third-party platform ratings. Edits show up live on the homepage. */
export function ReviewsView() {
  const { t, language: uiLanguage } = useLanguage()
  const [reviewsByLanguage, setReviewsByLanguage] = useReviews()
  const [activeTab, setActiveTab] = useState<'no' | 'en'>(uiLanguage)
  const reviews = reviewsByLanguage[activeTab]

  const updateReview = (index: number, field: 'name' | 'review', value: string) => {
    const updated = reviews.map((review, i) => (i === index ? { ...review, [field]: value } : review))
    setReviewsByLanguage({ ...reviewsByLanguage, [activeTab]: updated })
  }

  const addReview = () => {
    setReviewsByLanguage({ ...reviewsByLanguage, [activeTab]: [...reviews, { name: '', review: '' }] })
  }

  const removeReview = (index: number) => {
    setReviewsByLanguage({ ...reviewsByLanguage, [activeTab]: reviews.filter((_, i) => i !== index) })
  }

  return (
    <div className="reviews-view">
      <TranslatedText as="h1" id="admin.reviews.title" />

      <Card>
        <div className="reviews-view__tabs">
          <button type="button" className={activeTab === 'no' ? 'reviews-view__tab--active' : ''} onClick={() => setActiveTab('no')}>
            Norsk
          </button>
          <button type="button" className={activeTab === 'en' ? 'reviews-view__tab--active' : ''} onClick={() => setActiveTab('en')}>
            English
          </button>
        </div>

        <ul className="reviews-view__list">
          <AnimatePresence initial={false}>
            {reviews.map((review, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <Input
                  id={`review-name-${activeTab}-${index}`}
                  label={t('admin.reviews.nameLabel')}
                  value={review.name}
                  onChange={(event) => updateReview(index, 'name', event.target.value)}
                />
                <Textarea
                  id={`review-text-${activeTab}-${index}`}
                  label={t('admin.reviews.reviewLabel')}
                  value={review.review}
                  onChange={(event) => updateReview(index, 'review', event.target.value)}
                />
                <Button variant="secondary" onClick={() => removeReview(index)}>
                  {t('admin.common.delete')}
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <Button onClick={addReview}>{t('admin.reviews.addReview')}</Button>
      </Card>

      <RatingsEditor />
    </div>
  )
}
