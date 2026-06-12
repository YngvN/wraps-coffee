import foodoraLogo from '../assets/images/delivery/foodora-logo.png'
import woltLogo from '../assets/images/delivery/wolt-logo.png'
import { useLanguage } from '../i18n'
import './DeliveryLinks.scss'

/** A single delivery platform link: its order page, logo, and translation key for the accessible label. */
interface DeliveryLink {
  href: string
  logo: string
  labelKey: string
}

const DELIVERY_LINKS: DeliveryLink[] = [
  {
    href: 'https://www.foodora.no/restaurant/c0ro/wraps-and-coffee',
    logo: foodoraLogo,
    labelKey: 'delivery.foodora',
  },
  {
    href: 'https://wolt.com/nb/nor/oslo/restaurant/wraps-coffee-oslo',
    logo: woltLogo,
    labelKey: 'delivery.wolt',
  },
]

interface DeliveryLinksProps {
  className?: string
}

/**
 * Round buttons linking to Wraps & Coffee's order pages on third-party
 * delivery platforms (Foodora, Wolt). Each button shows the platform's logo
 * and zooms in slightly on hover/focus.
 */
export function DeliveryLinks({ className }: DeliveryLinksProps) {
  const { t } = useLanguage()

  return (
    <div className={['delivery-links', className].filter(Boolean).join(' ')}>
      {DELIVERY_LINKS.map(({ href, logo, labelKey }) => (
        <a
          key={labelKey}
          className="delivery-links__button"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(labelKey)}
        >
          <img className="delivery-links__logo" src={logo} alt="" />
        </a>
      ))}
    </div>
  )
}
