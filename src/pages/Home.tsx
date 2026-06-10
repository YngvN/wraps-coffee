import { TranslatedText } from '../components'

export function Home() {
  return (
    <section>
      <TranslatedText as="h1" id="home.title" />
      <TranslatedText as="p" id="home.welcome" />
    </section>
  )
}
