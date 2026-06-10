import { useAppSelector } from '../app/hooks'
import { TranslatedText } from '../components'
import { AuthForm } from '../features/auth/AuthForm'

export function Profile() {
  const user = useAppSelector((state) => state.auth.user)

  if (!user) {
    return (
      <section>
        <TranslatedText as="h1" id="profile.title" />
        <AuthForm />
      </section>
    )
  }

  return (
    <section>
      <TranslatedText as="h1" id="profile.title" />
      <TranslatedText as="p" id="profile.signedInAs" vars={{ name: user.name, email: user.email }} />
    </section>
  )
}
