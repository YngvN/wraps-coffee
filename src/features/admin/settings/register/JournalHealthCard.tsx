import { useEffect, useState } from 'react'
import { Button, Card } from '../../../../components'
import { useAdminSession } from '../../../../hooks/useAdminSession'
import { useLanguage } from '../../../../i18n'
import { fetchJournalHealth, type JournalHealth } from '../../../../lib/registerAdminApi'
import { formatClockTime } from '../../../../utils/clockFormat'
import { useClockFormatPreference } from '../../../../hooks/useClockFormatPreference'

/**
 * Settings → Register: the electronic journal's health — how many entries it holds and whether its last
 * integrity check (at server start, or "Check now") found anything changed, missing or cut off. A
 * problem is never repaired automatically: the journal is the legal record, so it's reported as found.
 */
export function JournalHealthCard() {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const { session } = useAdminSession()
  const token = session?.token
  const [health, setHealth] = useState<JournalHealth | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let alive = true
    fetchJournalHealth(token)
      .then((value) => {
        if (alive) setHealth(value)
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      alive = false
    }
  }, [token])

  const check = async () => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      setHealth(await fetchJournalHealth(token, true))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const ok = health !== null && health.problems.length === 0

  return (
    <Card className="register-settings">
      <h2>{t('admin.settings.register.journalTitle')}</h2>
      <p className="register-settings__hint">{t('admin.settings.register.journalHint')}</p>
      {health && (
        <p className={ok ? 'register-settings__ok' : 'register-settings__error'}>
          {ok
            ? t('admin.settings.register.journalOk', { count: health.entries, time: formatClockTime(new Date(health.checkedAt), language, clockFormat) })
            : t('admin.settings.register.journalProblems', { count: health.problems.length })}
        </p>
      )}
      {health && health.problems.length > 0 && (
        <ul className="register-journal__problems">
          {health.problems.slice(0, 20).map((problem, index) => (
            <li key={index}>
              <code>
                {problem.file}
                {problem.seq ? ` #${problem.seq}` : ''}
              </code>{' '}
              {problem.detail}
            </li>
          ))}
        </ul>
      )}
      <div className="register-settings__actions">
        <Button type="button" variant="secondary" onClick={() => void check()} disabled={busy || !token}>
          {t('admin.settings.register.journalCheck')}
        </Button>
      </div>
      {error && <p className="register-settings__error">{error}</p>}
    </Card>
  )
}
