import { useEffect, useState } from 'react'
import { useLanguage } from '../../../i18n'
import { fetchRegisterStaff, type RegisterStaffEntry } from '../../../lib/registerSessionApi'
import { RegisterPinPad } from './RegisterPinPad'
import type { SignInFailure } from './useRegisterSession'
import './RegisterLogin.scss'

interface RegisterLoginScreenProps {
  deviceId: string
  pinEveryTime: boolean
  online: boolean
  onSignIn: (staffId: string, pin?: string) => Promise<SignInFailure | null>
}

/**
 * What the register shows while nobody is signed in: every staff member who can sign in, as a big name
 * button. Someone who has already typed their PIN on this register today signs in with a tap; anyone
 * else gets their PIN pad first. With no staff set up yet it says where to add them.
 */
export function RegisterLoginScreen({ deviceId, pinEveryTime, online, onSignIn }: RegisterLoginScreenProps) {
  const { t } = useLanguage()
  const [staff, setStaff] = useState<RegisterStaffEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [pinFor, setPinFor] = useState<RegisterStaffEntry | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!online || pinFor) return
    let alive = true
    fetchRegisterStaff(deviceId, pinEveryTime).then(
      (list) => {
        if (!alive) return
        setStaff(list)
        setFailed(false)
      },
      () => {
        if (alive) setFailed(true)
      },
    )
    return () => {
      alive = false
    }
  }, [deviceId, pinEveryTime, online, pinFor])

  const choose = async (member: RegisterStaffEntry) => {
    if (member.needsPin) return setPinFor(member)
    setBusyId(member.id)
    const failure = await onSignIn(member.id)
    setBusyId(null)
    // Their PIN day may have ended since the list was fetched.
    if (failure?.reason === 'pinRequired') setPinFor(member)
  }

  if (pinFor) {
    return (
      <div className="register-login register-login--pin">
        <RegisterPinPad name={pinFor.name} onSubmit={(pin) => onSignIn(pinFor.id, pin)} onCancel={() => setPinFor(null)} />
      </div>
    )
  }

  return (
    <div className="register-login">
      <h2 className="register-login__title">{t('screenDisplay.register.whoIsSelling')}</h2>
      {!online && <p className="register-login__note">{t('screenDisplay.register.offlineNoSignIn')}</p>}
      {online && failed && <p className="register-login__note">{t('screenDisplay.register.staffListFailed')}</p>}
      {staff?.length === 0 && <p className="register-login__note">{t('screenDisplay.register.noStaff')}</p>}
      <div className="register-login__grid">
        {staff?.map((member) => (
          <button key={member.id} type="button" className="register-login__person" onClick={() => void choose(member)} disabled={!online || busyId !== null}>
            <span className="register-login__initial" aria-hidden="true">
              {member.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="register-login__name">{member.name}</span>
            <small>{member.needsPin ? t('screenDisplay.register.needsPin') : member.role === 'manager' ? t('screenDisplay.register.roleManager') : ' '}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
