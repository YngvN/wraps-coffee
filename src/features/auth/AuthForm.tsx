import { useState, type FormEvent } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { Button, Input, TranslatedText } from '../../components'
import { loginUser } from './authSlice'
import './AuthForm.scss'

export function AuthForm() {
  const dispatch = useAppDispatch()
  const { status, error } = useAppSelector((state) => state.auth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    dispatch(loginUser({ email, password }))
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <Input
        id="email"
        label={<TranslatedText id="auth.emailLabel" />}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <Input
        id="password"
        label={<TranslatedText id="auth.passwordLabel" />}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      <Button type="submit" disabled={status === 'loading'}>
        <TranslatedText id={status === 'loading' ? 'auth.signingIn' : 'auth.signIn'} />
      </Button>

      {error && <p className="auth-form__error">{error}</p>}
    </form>
  )
}
