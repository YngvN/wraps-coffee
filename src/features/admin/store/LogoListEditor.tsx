import { AnimatePresence, motion } from 'framer-motion'
import { ImageUploadField, PlusIcon } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { deleteUpload, isOwnUploadUrl } from '../../../lib/localServer'
import './LogoListEditor.scss'

interface LogoListEditorProps {
  logos: string[]
  onChange: (logos: string[]) => void
}

/**
 * A store's logos — zero or more uploaded images, added/removed freely (no
 * reordering). The only multi-image array field in this codebase; every
 * other image field elsewhere is a single optional `string`, so this wraps
 * one `ImageUploadField` per slot rather than introducing a new upload
 * mechanism of its own.
 */
export function LogoListEditor({ logos, onChange }: LogoListEditorProps) {
  const { t } = useLanguage()
  const { session } = useAdminSession()

  const updateLogo = (index: number, url: string) => {
    onChange(logos.map((logo, i) => (i === index ? url : logo)))
  }

  const removeLogo = (index: number) => {
    const removed = logos[index]
    onChange(logos.filter((_, i) => i !== index))
    if (session && removed && isOwnUploadUrl(removed)) void deleteUpload(removed, session.token)
  }

  return (
    <div className="logo-list-editor">
      <ul className="logo-list-editor__list">
        <AnimatePresence initial={false}>
          {logos.map((logo, index) => (
            <motion.li
              key={index}
              className="logo-list-editor__item"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <ImageUploadField id={`store-logo-${index}`} value={logo} onChange={(url) => updateLogo(index, url)} />
              <button type="button" className="logo-list-editor__remove" onClick={() => removeLogo(index)}>
                {t('admin.store.removeLogo')}
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <button type="button" className="logo-list-editor__add-row" onClick={() => onChange([...logos, ''])}>
        <PlusIcon />
        {t('admin.store.addLogo')}
      </button>
    </div>
  )
}
