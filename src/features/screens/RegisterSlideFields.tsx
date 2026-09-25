import { Checkbox, CollapsibleSection, HelpTip } from '../../components'
import { useCatalogues } from '../../hooks/useCatalogues'
import { useLanguage } from '../../i18n'
import type { ScreenSlotContent } from '../../types/screen'

type RegisterContent = Extract<ScreenSlotContent, { kind: 'register' }>

interface RegisterSlideFieldsProps {
  /** Prefix for this pane's own input ids. */
  id: string
  content: RegisterContent
  onChange: (content: RegisterContent) => void
}

/**
 * The settings under a `'register'` pane's kind picker, shared by both screen editors through
 * `SlideFields`: which catalogues it sells from, whether it prints a receipt after every sale, and
 * whether scanning a customer's pickup QR hands their website order over. The staff PIN is not here:
 * it's one PIN for every register, set in Settings → Register.
 */
export function RegisterSlideFields({ id, content, onChange }: RegisterSlideFieldsProps) {
  const { t, language } = useLanguage()
  const [catalogues] = useCatalogues()
  const selected = content.catalogueIds ?? catalogues.map((catalogue) => catalogue.id)

  const toggleCatalogue = (catalogueId: string, checked: boolean) => {
    const next = catalogues.map((catalogue) => catalogue.id).filter((candidate) => (candidate === catalogueId ? checked : selected.includes(candidate)))
    // Every catalogue checked is the same as unset — stored as unset, so a catalogue added later is sold too.
    onChange({ ...content, catalogueIds: next.length === catalogues.length ? undefined : next })
  }

  return (
    <>
      <CollapsibleSection label={t('admin.screens.registerCataloguesLabel')} hint={t('admin.screens.registerCataloguesHint')}>
        {catalogues.map((catalogue) => (
          <Checkbox
            key={catalogue.id}
            id={`${id}-register-catalogue-${catalogue.id}`}
            label={catalogue.name[language === 'en' ? 'en' : 'no'] || catalogue.name.no}
            checked={selected.includes(catalogue.id)}
            onChange={(event) => toggleCatalogue(catalogue.id, event.target.checked)}
          />
        ))}
      </CollapsibleSection>
      <Checkbox
        id={`${id}-register-print`}
        label={
          <>
            {t('admin.screens.registerAutoPrintLabel')} <HelpTip text={t('admin.screens.registerAutoPrintHint')} />
          </>
        }
        checked={Boolean(content.autoPrintReceipt)}
        onChange={(event) => onChange({ ...content, autoPrintReceipt: event.target.checked || undefined })}
      />
      <Checkbox
        id={`${id}-register-pickup`}
        label={
          <>
            {t('admin.screens.registerPickupScanLabel')} <HelpTip text={t('admin.screens.registerPickupScanHint')} />
          </>
        }
        checked={content.allowPickupScan !== false}
        onChange={(event) => onChange({ ...content, allowPickupScan: event.target.checked ? undefined : false })}
      />
      <p className="slide-fields__hint">{t('admin.screens.registerTrustHint')}</p>
    </>
  )
}
