import type { ReactNode } from 'react'
import {
  AppleLogo,
  DiscordLogo,
  GoogleLogo,
  GoogleAnalyticsLogo,
  GoogleDriveLogo,
  GoogleMapsLogo,
  InstagramLogo,
  KahootLogo,
  KlarnaLogo,
  MailchimpLogo,
  PaypalLogo,
  PhilipsHueLogo,
  PlausibleAnalyticsLogo,
  SentryLogo,
  ShellyLogo,
  ShopifyLogo,
  SonosLogo,
  SpeedtestLogo,
  SpotifyLogo,
  StravaLogo,
  StripeLogo,
  TodoistLogo,
  TpLinkLogo,
  TrelloLogo,
  TripAdvisorLogo,
  UntappdLogo,
  VimeoLogo,
  WooCommerceLogo,
  YoutubeLogo,
  ZendeskLogo,
} from './BrandLogos'
import { FetchedLogo, YrLogo } from '../../../components'
import { BarcodeIcon, ForecastTrendIcon, GiftIcon, PriceRadarIcon, QrCodeIcon, ScaleIcon, TablePlanIcon } from './GenericIntegrationIcons'

/** One of the 18 grouping headers shown in the "Coming soon" integrations directory — matches `admin.integrations.comingSoon.categories.<id>.title` in `languages.json`. */
export type ComingSoonCategoryId =
  | 'payments'
  | 'logistics'
  | 'ambience'
  | 'marketing'
  | 'localData'
  | 'staff'
  | 'booking'
  | 'devops'
  | 'sustainability'
  | 'guestExperience'
  | 'iot'
  | 'aiAnalytics'
  | 'delivery'
  | 'training'
  | 'loyalty'
  | 'itOps'
  | 'finance'
  | 'entertainment'

/** Ordered list of every category, in the order the sections render. */
export const COMING_SOON_CATEGORIES: ComingSoonCategoryId[] = [
  'payments',
  'logistics',
  'ambience',
  'marketing',
  'localData',
  'staff',
  'booking',
  'devops',
  'sustainability',
  'guestExperience',
  'iot',
  'aiAnalytics',
  'delivery',
  'training',
  'loyalty',
  'itOps',
  'finance',
  'entertainment',
]

/**
 * One not-yet-built integration shown as a disabled "Coming soon" card. `id`
 * is the item's key under its category in `admin.integrations.comingSoon.categories.<categoryId>.items.<id>`
 * (both `.name` and `.description`). `logos` are rendered side by side —
 * most items show one brand mark, a few (e.g. "Fiken / Tripletex") pair two.
 * `tags` are search-only keywords (never rendered) so the Integrations page's
 * search bar can surface an item by what it *does* rather than just its own
 * name — e.g. searching "kasse" or "POS" should find Vipps/Zettle/Stripe
 * even though none of those words appear in their name or description.
 * Deliberately untranslated/mixed English+Norwegian, since these are never
 * shown to the user, only matched against.
 */
export interface ComingSoonIntegration {
  id: string
  categoryId: ComingSoonCategoryId
  logos: ReactNode[]
  tags: string[]
}

export const COMING_SOON_INTEGRATIONS: ComingSoonIntegration[] = [
  // Betaling, Salg & Kassesystem (POS)
  { id: 'zettle', categoryId: 'payments', logos: [<FetchedLogo key="zettle" slug="zettle" label="Zettle" className="logo-chip" />, <PaypalLogo key="paypal" />], tags: ['pos', 'kasse', 'kassesystem', 'kassaapparat', 'kasseapparat', 'betaling', 'betalingsterminal', 'kortterminal', 'card reader', 'payment terminal', 'checkout', 'register'] },
  { id: 'vippsMobilepay', categoryId: 'payments', logos: [<FetchedLogo key="vipps" slug="vipps-mobilepay" label="Vipps MobilePay" />], tags: ['pos', 'kasse', 'kassaapparat', 'kasseapparat', 'betaling', 'payment', 'mobilbetaling', 'mobile payment', 'qr', 'vipps', 'mobilepay', 'checkout', 'register'] },
  { id: 'stripe', categoryId: 'payments', logos: [<StripeLogo key="stripe" />], tags: ['betaling', 'payment', 'nettbutikk', 'online payment', 'checkout', 'abonnement', 'subscription', 'kort', 'card'] },
  { id: 'klarna', categoryId: 'payments', logos: [<KlarnaLogo key="klarna" />], tags: ['betaling', 'payment', 'delbetaling', 'buy now pay later', 'bnpl', 'faktura', 'invoice', 'checkout', 'kasse', 'pos'] },

  // Logistikk, Lager & Regnskap
  { id: 'fikenTripletex', categoryId: 'logistics', logos: [<FetchedLogo key="fiken" slug="fiken" label="Fiken" />, <FetchedLogo key="tripletex" slug="tripletex" label="Tripletex" />], tags: ['regnskap', 'accounting', 'bokforing', 'bokføring', 'bookkeeping', 'faktura', 'invoice', 'lonn', 'lønn', 'payroll'] },
  { id: 'shopifyWoocommerce', categoryId: 'logistics', logos: [<ShopifyLogo key="shopify" />, <WooCommerceLogo key="woocommerce" />], tags: ['nettbutikk', 'ecommerce', 'e-commerce', 'lager', 'inventory', 'webshop'] },
  { id: 'barcodeTools', categoryId: 'logistics', logos: [<BarcodeIcon key="barcode" />], tags: ['strekkode', 'barcode', 'ean', 'scanner', 'skanner', 'varemerking', 'lager', 'inventory', 'kasse', 'pos'] },
  { id: 'inventoryPlanner', categoryId: 'logistics', logos: [<ForecastTrendIcon key="inventory-planner" />], tags: ['lager', 'inventory', 'varebeholdning', 'stock', 'forecasting', 'prognose', 'innkjop', 'innkjøp', 'purchasing'] },

  // Atmosfære & Kundemiljø
  { id: 'spotifyBusiness', categoryId: 'ambience', logos: [<SpotifyLogo key="spotify" />], tags: ['musikk', 'music', 'spilleliste', 'playlist', 'lyd', 'audio', 'stemning', 'ambience'] },
  { id: 'sonos', categoryId: 'ambience', logos: [<SonosLogo key="sonos" className="logo-chip" />], tags: ['hoyttaler', 'høyttaler', 'speaker', 'lyd', 'audio', 'musikk', 'music', 'volum'] },
  { id: 'philipsHue', categoryId: 'ambience', logos: [<PhilipsHueLogo key="philipshue" />], tags: ['lys', 'lighting', 'belysning', 'smarthjem', 'smart home', 'dimming'] },

  // Skjermer, Markedsføring & Kundelojalitet
  { id: 'mailchimpKlaviyo', categoryId: 'marketing', logos: [<MailchimpLogo key="mailchimp" />, <FetchedLogo key="klaviyo" slug="klaviyo" label="Klaviyo" />], tags: ['epost', 'e-post', 'email', 'nyhetsbrev', 'newsletter', 'markedsforing', 'markedsføring', 'marketing', 'kundeklubb', 'loyalty'] },
  { id: 'googleBusinessProfile', categoryId: 'marketing', logos: [<GoogleLogo key="google" />], tags: ['google', 'apningstider', 'åpningstider', 'opening hours', 'anmeldelser', 'reviews', 'maps'] },
  { id: 'instagramFeed', categoryId: 'marketing', logos: [<InstagramLogo key="instagram" />], tags: ['instagram', 'sosiale medier', 'social media', 'bilder', 'photos', 'feed'] },
  { id: 'untappdMenu', categoryId: 'marketing', logos: [<UntappdLogo key="untappd" />], tags: ['ol', 'øl', 'beer', 'olmeny', 'ølmeny', 'beer menu', 'bar', 'drikke', 'drinks'] },
  { id: 'qrGenerator', categoryId: 'marketing', logos: [<QrCodeIcon key="qr" />], tags: ['qr', 'qr-kode', 'qr code', 'bordbestilling', 'meny', 'menu'] },

  // Lokale sanntidsdata (Kiosk-skjermer) — Entur/Ruter transit and Yr weather
  // are deliberately excluded here: those two are the live integrations this
  // page already ships above, not upcoming ones.
  { id: 'airthingsAir', categoryId: 'localData', logos: [<FetchedLogo key="airthings" slug="airthings" label="Airthings" />], tags: ['luftkvalitet', 'air quality', 'co2', 'sensor', 'inneklima', 'indoor climate'] },

  // Drift, Vakter & Personal
  { id: 'plandayDeputy', categoryId: 'staff', logos: [<FetchedLogo key="planday" slug="planday" label="Planday" />, <FetchedLogo key="deputy" slug="deputy" label="Deputy" />], tags: ['vaktliste', 'schedule', 'shift', 'timeliste', 'stemplingsklokke', 'clock in', 'vakter', 'staff', 'personal', 'ansatte'] },
  { id: 'slackDiscord', categoryId: 'staff', logos: [<FetchedLogo key="slack" slug="slack" label="Slack" />, <DiscordLogo key="discord" />], tags: ['varsler', 'notifications', 'chat', 'melding', 'message', 'webhook', 'ansatte', 'staff'] },
  { id: 'trelloTodoist', categoryId: 'staff', logos: [<TrelloLogo key="trello" />, <TodoistLogo key="todoist" />], tags: ['huskeliste', 'checklist', 'todo', 'oppgaver', 'tasks', 'rutiner', 'routines'] },

  // Kundeservice, Bestilling & Booking
  // Wolt and Foodora are no longer "coming soon" — both are real,
  // toggleable integrations now (see `IntegrationsView.tsx`'s own
  // `woltSubmenu`/`foodoraSubmenu`).
  { id: 'tablePlanner', categoryId: 'booking', logos: [<TablePlanIcon key="tableplanner" />], tags: ['bordbestilling', 'table booking', 'reservasjon', 'reservation', 'selskap', 'event booking', 'bordkart'] },
  { id: 'zendesk', categoryId: 'booking', logos: [<ZendeskLogo key="zendesk" />], tags: ['kundeservice', 'customer service', 'chat', 'support', 'innboks', 'inbox'] },

  // Sikkerhet, Analyse & Dev
  { id: 'bankidSignicat', categoryId: 'devops', logos: [<FetchedLogo key="bankid" slug="bankid" label="BankID" />, <FetchedLogo key="signicat" slug="signicat" label="Signicat" />], tags: ['id', 'identitet', 'identity', 'verifisering', 'verification', 'signering', 'e-signature', 'bankid'] },
  { id: 'googleAnalyticsPlausible', categoryId: 'devops', logos: [<GoogleAnalyticsLogo key="ga" />, <PlausibleAnalyticsLogo key="plausible" />], tags: ['statistikk', 'analytics', 'besokstall', 'besøkstall', 'visitor stats', 'trafikk', 'traffic'] },
  { id: 'sentry', categoryId: 'devops', logos: [<SentryLogo key="sentry" />], tags: ['feil', 'error', 'overvaking', 'overvåking', 'monitoring', 'krasj', 'crash', 'debugging'] },
  { id: 'twilioSms', categoryId: 'devops', logos: [<FetchedLogo key="twilio" slug="twilio" label="Twilio" />], tags: ['sms', 'tekstmelding', 'text message', 'varsling', 'notification'] },
  { id: 'netatmoCamera', categoryId: 'devops', logos: [<FetchedLogo key="netatmo" slug="netatmo" label="Netatmo" className="logo-chip" />], tags: ['kamera', 'camera', 'overvaking', 'overvåking', 'surveillance', 'sikkerhet', 'security'] },

  // Matsvinn & Bærekraft
  { id: 'tooGoodToGo', categoryId: 'sustainability', logos: [<FetchedLogo key="tgtg" slug="too-good-to-go" label="Too Good To Go" />], tags: ['matsvinn', 'food waste', 'overskuddsmat', 'surplus food', 'baerekraft', 'bærekraft', 'sustainability'] },
  { id: 'karmaResqclub', categoryId: 'sustainability', logos: [<FetchedLogo key="karma" slug="karma" label="Karma" onDark />, <FetchedLogo key="resqclub" slug="resqclub" label="ResQ Club" />], tags: ['matsvinn', 'food waste', 'overskuddsmat', 'surplus food', 'baerekraft', 'bærekraft', 'sustainability', 'rabatt', 'discount'] },
  { id: 'wasteCalculator', categoryId: 'sustainability', logos: [<ScaleIcon key="waste-calc" />], tags: ['matsvinn', 'food waste', 'svinn', 'waste', 'rapport', 'report'] },

  // Gjesteopplevelse & Bordbestilling
  { id: 'untappdBusiness', categoryId: 'guestExperience', logos: [<UntappdLogo key="untappd" />], tags: ['ol', 'øl', 'beer', 'vin', 'wine', 'meny', 'menu', 'bar'] },
  { id: 'opentableResy', categoryId: 'guestExperience', logos: [<FetchedLogo key="opentable" slug="opentable" label="OpenTable" className="logo-chip" />, <FetchedLogo key="resy" slug="resy" label="Resy" />], tags: ['bordbestilling', 'table booking', 'reservasjon', 'reservation', 'restaurant'] },
  { id: 'tripadvisorReview', categoryId: 'guestExperience', logos: [<TripAdvisorLogo key="tripadvisor" />], tags: ['anmeldelse', 'review', 'tilbakemelding', 'feedback', 'rating'] },

  // Smarte Sensorer & IoT
  { id: 'ruuvitag', categoryId: 'iot', logos: [<FetchedLogo key="ruuvitag" slug="ruuvitag" label="RuuviTag" className="logo-chip" />], tags: ['sensor', 'temperatur', 'temperature', 'kjoleskap', 'kjøleskap', 'fridge', 'fryser', 'freezer', 'bluetooth', 'varsel', 'alert'] },
  { id: 'smartPlugs', categoryId: 'iot', logos: [<ShellyLogo key="shelly" />, <TpLinkLogo key="tplink" />], tags: ['smart plug', 'strom', 'strøm', 'power', 'kaffemaskin', 'coffee machine', 'automasjon', 'automation'] },
  { id: 'airthingsBusiness', categoryId: 'iot', logos: [<FetchedLogo key="airthings-biz" slug="airthings" label="Airthings" />], tags: ['luftkvalitet', 'air quality', 'co2', 'radon', 'inneklima'] },
  { id: 'wifiLogin', categoryId: 'iot', logos: [<FetchedLogo key="tanaza" slug="tanaza" label="Tanaza" />, <FetchedLogo key="purplewifi" slug="purplewifi" label="Purple WiFi" />], tags: ['wifi', 'gjeste-wifi', 'guest wifi', 'internett', 'internet', 'gdpr'] },

  // Avansert Analyse & Kunstig Intelligens
  { id: 'chatgptAssistant', categoryId: 'aiAnalytics', logos: [<FetchedLogo key="openai" slug="openai" label="OpenAI" />], tags: ['ai', 'kunstig intelligens', 'artificial intelligence', 'chatgpt', 'tekst', 'writing assistant', 'nyhetsbrev'] },
  { id: 'priceCrawler', categoryId: 'aiAnalytics', logos: [<PriceRadarIcon key="price-crawler" />], tags: ['pris', 'price', 'konkurrent', 'competitor', 'prissammenligning'] },
  { id: 'salesForecast', categoryId: 'aiAnalytics', logos: [<YrLogo key="yr" />, <ForecastTrendIcon key="trend" />], tags: ['salg', 'sales', 'prognose', 'forecast', 'vaer', 'vær', 'weather'] },

  // Utkjøring & Logistikk (Egen regi)
  { id: 'lalamovePorterbuddy', categoryId: 'delivery', logos: [<FetchedLogo key="lalamove" slug="lalamove" label="Lalamove" />, <FetchedLogo key="porterbuddy" slug="porterbuddy" label="Porterbuddy" />], tags: ['bud', 'courier', 'levering', 'delivery', 'catering'] },
  { id: 'googleMapsRoute', categoryId: 'delivery', logos: [<GoogleMapsLogo key="googlemaps" />], tags: ['rute', 'route', 'kart', 'maps', 'kjoring', 'kjøring', 'driving', 'catering'] },

  // Internkommunikasjon & Opplæring
  { id: 'hmsLibrary', categoryId: 'training', logos: [<FetchedLogo key="svenn" slug="svenn" label="Svenn" className="logo-chip" />, <FetchedLogo key="mellora" slug="mellora" label="Mellora" />], tags: ['hms', 'health and safety', 'forstehjelp', 'førstehjelp', 'first aid', 'brann', 'fire safety', 'avvik', 'incident'] },
  { id: 'trainingVideos', categoryId: 'training', logos: [<VimeoLogo key="vimeo" />, <YoutubeLogo key="youtube" />], tags: ['opplaering', 'opplæring', 'training', 'video', 'kurs', 'course', 'nyansatt', 'new employee'] },

  // Lojalitet, Gavekort & Kuponger
  { id: 'walletPass', categoryId: 'loyalty', logos: [<AppleLogo key="apple" className="logo-chip" />, <GoogleLogo key="google" />], tags: ['lojalitet', 'loyalty', 'stempelkort', 'stamp card', 'lommebok', 'wallet'] },
  { id: 'givexYiftee', categoryId: 'loyalty', logos: [<FetchedLogo key="givex" slug="givex" label="Givex" />, <FetchedLogo key="yiftee" slug="yiftee" label="Yiftee" />], tags: ['gavekort', 'gift card', 'kupong', 'coupon'] },
  { id: 'birthdayTrigger', categoryId: 'loyalty', logos: [<GiftIcon key="birthday" />], tags: ['bursdag', 'birthday', 'sms', 'kupong', 'coupon'] },

  // IT-drift, Overvåking & Backup
  { id: 'uptimeRobot', categoryId: 'itOps', logos: [<FetchedLogo key="uptimerobot" slug="uptimerobot" label="Uptime Robot" className="logo-chip" />], tags: ['oppetid', 'uptime', 'overvaking', 'overvåking', 'monitoring', 'nedetid', 'downtime', 'varsel', 'alert'] },
  { id: 'cloudBackup', categoryId: 'itOps', logos: [<FetchedLogo key="aws" slug="aws" label="AWS" />, <GoogleDriveLogo key="googledrive" />], tags: ['backup', 'sikkerhetskopi', 'sky', 'cloud', 'database'] },
  { id: 'speedtestCli', categoryId: 'itOps', logos: [<SpeedtestLogo key="speedtest" className="logo-chip" />], tags: ['internett', 'internet', 'nettverk', 'network', 'hastighet', 'speed'] },

  // Finans & Forsikring
  { id: 'storeboxReceipt', categoryId: 'finance', logos: [<FetchedLogo key="storebox" slug="storebox" label="Storebox" />], tags: ['kvittering', 'receipt', 'papirlos', 'papirløs', 'paperless'] },
  { id: 'currencyConverter', categoryId: 'finance', logos: [<FetchedLogo key="oer" slug="openexchangerates" label="Open Exchange Rates" onDark />], tags: ['valuta', 'currency', 'kurs', 'exchange rate', 'eur', 'usd'] },

  // Underholdning & Community i kafeen
  { id: 'quizModule', categoryId: 'entertainment', logos: [<KahootLogo key="kahoot" />], tags: ['quiz', 'underholdning', 'entertainment'] },
  { id: 'stravaClub', categoryId: 'entertainment', logos: [<StravaLogo key="strava" />], tags: ['strava', 'sykling', 'cycling', 'loping', 'løping', 'running', 'klubb', 'club'] },
  { id: 'untappdBadge', categoryId: 'entertainment', logos: [<UntappdLogo key="untappd" />], tags: ['ol', 'øl', 'beer', 'checkin', 'sjekk inn'] },
  { id: 'linkedinJobBoard', categoryId: 'entertainment', logos: [<FetchedLogo key="linkedin" slug="linkedin" label="LinkedIn" />], tags: ['jobb', 'job', 'stillingsannonse', 'stilling', 'oppslagstavle', 'job board'] },
]
