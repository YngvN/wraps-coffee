import type { ReactNode } from 'react'
import { Button } from '../../../../components'
import { useLanguage } from '../../../../i18n'
import './SetupStep.scss'

interface SetupStepProps {
  title: string
  /** One or two sentences of plain-language context. Rendered above the body. */
  intro?: string
  /** Position in the flow, e.g. 2 of 5. Omit on screens outside the numbered steps. */
  stepNumber?: number
  stepCount?: number
  children?: ReactNode
  onBack?: () => void
  /** Omit to hide the primary button entirely — used by steps that branch instead of advancing. */
  onNext?: () => void
  /** Overrides the default "Next" label, e.g. "Finish" on the last step. */
  nextLabel?: string
  nextDisabled?: boolean
}

/**
 * The shared frame every screen of the website setup uses: a step counter, a
 * heading, an intro, the step's own body, and a Back/Next pair pinned at the
 * bottom.
 *
 * Exists so each step file contains only what makes that step different.
 * Keeping the chrome identical across steps is most of what makes a wizard
 * feel like one sequence rather than five unrelated forms.
 */
export function SetupStep({ title, intro, stepNumber, stepCount, children, onBack, onNext, nextLabel, nextDisabled }: SetupStepProps) {
  const { t } = useLanguage()

  return (
    <section className="setup-step">
      {stepNumber !== undefined && stepCount !== undefined && stepCount > 0 && (
        <p className="setup-step__counter">{t('admin.settings.website.stepCounter', { current: stepNumber, total: stepCount })}</p>
      )}

      <h3 className="setup-step__title">{title}</h3>
      {intro && <p className="setup-step__intro">{intro}</p>}

      <div className="setup-step__body">{children}</div>

      {(onBack || onNext) && (
        <div className="setup-step__actions">
          {onBack && (
            <Button type="button" variant="secondary" onClick={onBack}>
              {t('admin.common.back')}
            </Button>
          )}
          {onNext && (
            <Button type="button" onClick={onNext} disabled={nextDisabled}>
              {nextLabel ?? t('admin.settings.website.next')}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
