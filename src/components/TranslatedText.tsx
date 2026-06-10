import { AnimatePresence, motion } from 'framer-motion'
import type { ElementType } from 'react'
import { useLanguage } from '../i18n'

interface TranslatedTextProps {
  /** Dot-separated key into `languages.json`, e.g. "home.title". */
  id: string
  /** Values to interpolate into `{{placeholders}}` in the translation. */
  vars?: Record<string, string | number>
  /** Element type to render as. Defaults to "span". */
  as?: ElementType
  className?: string
}

/** Opacity variants used to cross-fade text when the active language changes. */
const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

/**
 * Renders translated text for `id` and cross-fades it (via Framer Motion)
 * whenever the active language changes.
 */
export function TranslatedText({ id, vars, as = 'span', className }: TranslatedTextProps) {
  const { t, language } = useLanguage()
  // Look up the pre-built motion component for this tag (e.g. motion.span, motion.h1)
  // rather than calling motion.create() during render.
  const MotionTag = (motion as unknown as Record<string, ElementType>)[as as string]

  return (
    <AnimatePresence mode="wait" initial={false}>
      <MotionTag
        key={language}
        className={className}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={fadeVariants}
        transition={{ duration: 0.2 }}
      >
        {t(id, vars)}
      </MotionTag>
    </AnimatePresence>
  )
}
