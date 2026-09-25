import { useEffect, useMemo, useState } from 'react'
import { Spinner } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { Catalogue } from '../../../types/category'
import type { Product } from '../../../types/product'
import { saveRegisterProduct, uploadRegisterPhoto } from '../../../lib/registerApi'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import { RegisterAllergenPicker } from './RegisterAllergenPicker'
import { RegisterSheet } from './RegisterSheet'
import { draftToInput, initialDraft, placementOptions, type EditorSubject, type ProductDraft } from './registerProductDraft'

interface RegisterProductEditorProps {
  subject: EditorSubject
  deviceId: string
  catalogues: Catalogue[]
  /** Resolves the live unlock token, opening the PIN pad first if needed; `null` if staff cancel. */
  requireUnlock: () => Promise<string | null>
  /** Routes scans to this form's barcode field while it's open (`null` to stop). */
  setScanCapture: (target: ((code: string) => void) | null) => void
  onSaved: (product: Product, subject: EditorSubject) => void
  onClose: () => void
}

/**
 * Adds or edits one product from the register: names, price (optionally a different eat-in price),
 * barcode (a scan while the form is open fills it), where it lives, ready-to-serve, stock, allergens
 * and a photo taken with the tablet. A barcode draft from Open Food Facts arrives prefilled, but
 * nothing is sold until staff give it a price and save — the server never creates a product itself.
 * Saving needs the staff PIN; the PIN pad opens on top if the register is locked.
 */
export function RegisterProductEditor({ subject, deviceId, catalogues, requireUnlock, setScanCapture, onSaved, onClose }: RegisterProductEditorProps) {
  const { t, language } = useLanguage()
  const lang = language === 'en' ? 'en' : 'no'
  const options = useMemo(() => placementOptions(catalogues, lang, t('screenDisplay.register.directlyInCatalogue')), [catalogues, lang, t])
  const [draft, setDraft] = useState<ProductDraft>(() => initialDraft(subject, options[0]?.value ?? ''))
  const [busy, setBusy] = useState<'saving' | 'photo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<ProductDraft>) => setDraft((current) => ({ ...current, ...patch }))

  useEffect(() => {
    setScanCapture((code) => setDraft((current) => ({ ...current, barcode: code })))
    return () => setScanCapture(null)
  }, [setScanCapture])

  const takePhoto = async (file: File | undefined) => {
    if (!file) return
    const token = await requireUnlock()
    if (!token) return
    setBusy('photo')
    setError(null)
    try {
      set({ image: await uploadRegisterPhoto(deviceId, token, file), imageCredit: undefined })
    } catch {
      setError(t('screenDisplay.register.photoFailed'))
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    const built = draftToInput(draft)
    if (!built.ok) return setError(t('screenDisplay.register.productError.noPrice'))
    const token = await requireUnlock()
    if (!token) return
    setBusy('saving')
    setError(null)
    try {
      const result = await saveRegisterProduct(deviceId, token, built.input)
      if (result.ok) onSaved(result.product, subject)
      else setError(t(`screenDisplay.register.productError.${result.reason}`))
    } catch {
      setError(t('screenDisplay.register.saveFailed'))
    } finally {
      setBusy(null)
    }
  }

  const title =
    subject.mode === 'edit'
      ? t('screenDisplay.register.editProduct')
      : subject.mode === 'create'
        ? t('screenDisplay.register.newProduct')
        : t('screenDisplay.register.confirmBarcode')
  const groups = [...new Set(options.map((option) => option.group))]

  return (
    <RegisterSheet title={title} onClose={onClose} className="register-sheet--editor">
      <div className="register-editor">
        {subject.mode === 'draft' && <p className="register-editor__hint">{t('screenDisplay.register.draftHint')}</p>}
        {subject.mode === 'quickAdd' && <p className="register-editor__hint">{t('screenDisplay.register.quickAddHint')}</p>}
        <div className="register-editor__photo">
          {draft.image ? <img src={getThumbnailUrl(draft.image)} alt="" /> : <span className="register__tile-image register__tile-image--empty" />}
          <label className="order-sheet__action register-editor__photo-button">
            {busy === 'photo' ? <Spinner size="sm" /> : draft.image ? t('screenDisplay.register.retakePhoto') : t('screenDisplay.register.takePhoto')}
            <input type="file" accept="image/*" capture="environment" hidden onChange={(event) => void takePhoto(event.target.files?.[0])} />
          </label>
          {draft.imageCredit && <small className="register-editor__credit">{t('screenDisplay.register.photoCredit', { credit: draft.imageCredit })}</small>}
        </div>
        <div className="register-editor__grid">
          <label>
            <span>{t('screenDisplay.register.nameNo')}</span>
            <input value={draft.nameNo} maxLength={80} onChange={(event) => set({ nameNo: event.target.value })} />
          </label>
          <label>
            <span>{t('screenDisplay.register.nameEn')}</span>
            <input value={draft.nameEn} maxLength={80} onChange={(event) => set({ nameEn: event.target.value })} />
          </label>
          <label>
            <span>{t('screenDisplay.register.price')}</span>
            <input inputMode="decimal" value={draft.price} onChange={(event) => set({ price: event.target.value })} />
          </label>
          <label>
            <span>{t('screenDisplay.register.eatInPrice')}</span>
            <input
              inputMode="decimal"
              value={draft.eatInPrice}
              placeholder={t('screenDisplay.register.sameAsTakeaway')}
              onChange={(event) => set({ eatInPrice: event.target.value })}
            />
          </label>
          <label>
            <span>{t('screenDisplay.register.barcode')}</span>
            <input inputMode="numeric" value={draft.barcode} placeholder={t('screenDisplay.register.barcodeHint')} onChange={(event) => set({ barcode: event.target.value })} />
          </label>
          <label>
            <span>{t('screenDisplay.register.placement')}</span>
            <select value={draft.placement} onChange={(event) => set({ placement: event.target.value })}>
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {options
                    .filter((option) => option.group === group)
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        <label className="register-editor__check">
          <input type="checkbox" checked={draft.readyToServe} onChange={(event) => set({ readyToServe: event.target.checked })} />
          <span>
            {t('screenDisplay.register.readyToServe')}
            <small>{t('screenDisplay.register.readyToServeHint')}</small>
          </span>
        </label>
        <label className="register-editor__check">
          <input type="checkbox" checked={draft.trackStock} onChange={(event) => set({ trackStock: event.target.checked })} />
          <span>{t('screenDisplay.register.trackStock')}</span>
        </label>
        {draft.trackStock && (
          <label className="register-editor__stock">
            <span>{t('screenDisplay.register.stockQuantity')}</span>
            <input inputMode="numeric" value={draft.stockQuantity} onChange={(event) => set({ stockQuantity: event.target.value })} />
          </label>
        )}
        <RegisterAllergenPicker value={draft.allergens} onChange={(allergens) => set({ allergens })} toCheck={draft.allergensToCheck} fromOpenFoodFacts={draft.fromOpenFoodFacts} />
        {error && (
          <p className="register__blocked" role="alert">
            {error}
          </p>
        )}
        <div className="register-pay__row">
          <button type="button" className="order-sheet__action" onClick={onClose}>
            {t('screenDisplay.register.cancel')}
          </button>
          <button type="button" className="order-sheet__action register__pay" onClick={() => void save()} disabled={busy !== null}>
            {busy === 'saving' ? (
              <Spinner size="sm" />
            ) : subject.mode === 'draft' || subject.mode === 'quickAdd' ? (
              t('screenDisplay.register.saveAndAdd')
            ) : (
              t('screenDisplay.register.save')
            )}
          </button>
        </div>
      </div>
    </RegisterSheet>
  )
}
