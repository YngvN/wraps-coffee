import { useState } from 'react'
import { Checkbox, CollapsibleSection, HelpTip, Input, NumberInput } from '../../components'
import { useLanguage } from '../../i18n'
import type { OrderSource } from '../../types/order'
import { DEFAULT_ORDERS_AGE_WARN_MINUTES, DEFAULT_ORDERS_HISTORY_HOURS, DEFAULT_ORDERS_NOTE_KEYWORDS, type ScreenSlotContent } from '../../types/screen'

type OrdersContent = Extract<ScreenSlotContent, { kind: 'orders' }>

const ALL_SOURCES: OrderSource[] = ['website', 'wolt', 'foodora']

interface OrdersSlideFieldsProps {
  /** Prefix for this pane's own input ids. */
  id: string
  content: OrdersContent
  onChange: (content: OrdersContent) => void
}

/**
 * The settings under an `'orders'` pane's kind picker, shared by both screen editors through
 * `SlideFields`. Which audience (staff/customer) is picked in the kind select itself, so this only
 * shows the fields that apply to the current mode: staff mode gets Touch control, lanes, chime, age
 * thresholds, note keywords and history length; customer mode gets the ready auto-hide. Both get the
 * source filter.
 */
export function OrdersSlideFields({ id, content, onChange }: OrdersSlideFieldsProps) {
  const { t } = useLanguage()
  const [warn, late] = content.ageWarnMinutes ?? DEFAULT_ORDERS_AGE_WARN_MINUTES
  // The keyword list is edited as free text and only split on commit, so typing a comma or a space
  // doesn't get normalised away mid-word.
  const [keywordsDraft, setKeywordsDraft] = useState((content.noteKeywords ?? DEFAULT_ORDERS_NOTE_KEYWORDS).join(', '))

  const sources = content.sources ?? ALL_SOURCES
  const toggleSource = (source: OrderSource, checked: boolean) => {
    const next = ALL_SOURCES.filter((candidate) => (candidate === source ? checked : sources.includes(candidate)))
    // All three checked is the same as unset — stored as unset, so a future fourth source is included by default.
    onChange({ ...content, sources: next.length === ALL_SOURCES.length ? undefined : next })
  }

  const commitKeywords = () => {
    const keywords = keywordsDraft
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean)
    onChange({ ...content, noteKeywords: keywords })
  }

  return (
    <>
      <CollapsibleSection label={t('admin.screens.ordersSourcesLabel')} hint={t('admin.screens.ordersSourcesHint')}>
        {ALL_SOURCES.map((source) => (
          <Checkbox
            key={source}
            id={`${id}-orders-source-${source}`}
            label={t(`admin.screens.ordersSource.${source}`)}
            checked={sources.includes(source)}
            onChange={(event) => toggleSource(source, event.target.checked)}
          />
        ))}
      </CollapsibleSection>

      {content.mode === 'customer' ? (
        <label className="slide-fields__number-field">
          <span>
            {t('admin.screens.ordersReadyAutoHideLabel')} <HelpTip text={t('admin.screens.ordersReadyAutoHideHint')} />
          </span>
          <NumberInput min={0} value={content.readyAutoHideMinutes ?? 0} onChange={(minutes) => onChange({ ...content, readyAutoHideMinutes: minutes > 0 ? minutes : undefined })} />
        </label>
      ) : (
        <>
          <Checkbox
            id={`${id}-orders-touch`}
            label={
              <>
                {t('admin.screens.ordersTouchControlLabel')} <HelpTip text={t('admin.screens.ordersTouchControlHint')} />
              </>
            }
            checked={Boolean(content.touchControl)}
            onChange={(event) => onChange({ ...content, touchControl: event.target.checked })}
          />
          <Checkbox
            id={`${id}-orders-group-delivery`}
            label={t('admin.screens.ordersGroupDeliveryLabel')}
            checked={content.groupDelivery ?? true}
            onChange={(event) => onChange({ ...content, groupDelivery: event.target.checked })}
          />
          <Checkbox id={`${id}-orders-chime`} label={t('admin.screens.ordersChimeLabel')} checked={content.chime ?? true} onChange={(event) => onChange({ ...content, chime: event.target.checked })} />
          <label className="slide-fields__number-field">
            <span>{t('admin.screens.ordersAgeWarnLabel')}</span>
            <NumberInput min={1} value={warn} onChange={(minutes) => onChange({ ...content, ageWarnMinutes: [minutes, Math.max(minutes, late)] })} />
          </label>
          <label className="slide-fields__number-field">
            <span>{t('admin.screens.ordersAgeLateLabel')}</span>
            <NumberInput min={1} value={late} onChange={(minutes) => onChange({ ...content, ageWarnMinutes: [Math.min(warn, minutes), minutes] })} />
          </label>
          <label className="slide-fields__number-field">
            <span>{t('admin.screens.ordersHistoryHoursLabel')}</span>
            <NumberInput min={1} max={24} value={content.historyHours ?? DEFAULT_ORDERS_HISTORY_HOURS} onChange={(historyHours) => onChange({ ...content, historyHours })} />
          </label>
          <label className="slide-fields__slider">
            <span>
              {t('admin.screens.ordersNoteKeywordsLabel')} <HelpTip text={t('admin.screens.ordersNoteKeywordsHint')} />
            </span>
            <Input id={`${id}-orders-keywords`} value={keywordsDraft} onChange={(event) => setKeywordsDraft(event.target.value)} onBlur={commitKeywords} />
          </label>
        </>
      )}
    </>
  )
}
