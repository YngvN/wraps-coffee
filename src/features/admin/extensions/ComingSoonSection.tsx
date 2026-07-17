import { useState } from 'react'
import { Badge } from '../../../components'
import { useLanguage } from '../../../i18n'
import { AnimatedDetails } from './AnimatedDetails'
import { COMING_SOON_CATEGORIES, COMING_SOON_EXTENSIONS, type ComingSoonCategoryId } from './comingSoonExtensions'
import './ComingSoonSection.scss'

/**
 * Read-only directory of third-party integrations that don't exist yet,
 * grouped into the same 18 categories the product roadmap uses and shown as
 * disabled cards with a "Coming soon" badge. Each category is a collapsible
 * `AnimatedDetails` (rather than a native `<details>`, so opening/closing
 * one slides its own content in/out instead of snapping — see that
 * component) so the whole list (~60 items) doesn't have to render open at
 * once. Logos come from `comingSoonExtensions.tsx` — either a real brand
 * mark (`BrandLogos.tsx`/`FetchedLogo.tsx`) or a generic glyph for
 * capabilities with no single owning brand.
 */
export function ComingSoonSection() {
  const { t } = useLanguage()
  /** Which categories are expanded — every category starts collapsed (this list runs to ~60 items), so only ids the admin has actually opened live here. */
  const [openCategories, setOpenCategories] = useState<Set<ComingSoonCategoryId>>(new Set())

  const toggleCategory = (categoryId: ComingSoonCategoryId) => {
    setOpenCategories((current) => {
      const next = new Set(current)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  return (
    <section className="coming-soon-section">
      <h2>{t('admin.extensions.comingSoon.sectionTitle')}</h2>
      <p className="admin-page-description">{t('admin.extensions.comingSoon.sectionDescription')}</p>

      {COMING_SOON_CATEGORIES.map((categoryId) => {
        const items = COMING_SOON_EXTENSIONS.filter((item) => item.categoryId === categoryId)
        return (
          <AnimatedDetails
            key={categoryId}
            className="coming-soon-section__category"
            summaryClassName="coming-soon-section__summary"
            bodyClassName="coming-soon-section__grid"
            open={openCategories.has(categoryId)}
            onToggle={() => toggleCategory(categoryId)}
            summary={
              <>
                <span className="coming-soon-section__chevron" aria-hidden="true">
                  ▸
                </span>
                {t(`admin.extensions.comingSoon.categories.${categoryId}.title`)}
                <span className="coming-soon-section__count">{items.length}</span>
              </>
            }
          >
            {items.map((item) => (
              <div key={item.id} className="coming-soon-item">
                <div className="coming-soon-item__logos">{item.logos}</div>
                <div className="coming-soon-item__text">
                  <p className="coming-soon-item__name">{t(`admin.extensions.comingSoon.categories.${categoryId}.items.${item.id}.name`)}</p>
                  <p className="coming-soon-item__description">{t(`admin.extensions.comingSoon.categories.${categoryId}.items.${item.id}.description`)}</p>
                </div>
                <Badge variant="neutral">{t('admin.extensions.comingSoon.badge')}</Badge>
              </div>
            ))}
          </AnimatedDetails>
        )
      })}
    </section>
  )
}
