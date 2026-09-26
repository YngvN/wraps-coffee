import { useEffect, useMemo, useState } from 'react'
import { FetchedLogo, YrLogo } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useDisplayMachines } from '../../../hooks/useDisplayMachines'
import { useDisplayPairingRequests } from '../../../hooks/useDisplayPairingRequests'
import { connectionBadgeId } from '../displayManager/connectionBadge'
import { useEvents } from '../../../hooks/useEvents'
import { useMessageBoardPosts } from '../../../hooks/useMessageBoardPosts'
import { useMessageBoards } from '../../../hooks/useMessageBoards'
import { useProducts } from '../../../hooks/useProducts'
import { useScreens } from '../../../hooks/useScreens'
import { useLanguage } from '../../../i18n'
import { listUsers, type AdminUserSummary } from '../../../lib/localServer'
import { NEWS_SOURCES } from '../../../types/news'
import { resolveBilingualField } from '../../../utils/bilingual'
import { resolveProductCatalogue } from '../../../utils/productCatalogue'
import { ENTUR_TAGS, TRANSIT_TAGS, WEATHER_TAGS } from '../integrations/integrationSearchTags'
import { ADMIN_NAV_ICONS, NAV_ITEMS } from '../layout/adminNavItems'
import type { SearchResultEntry } from './searchTypes'

/** Search-only keywords for the two delivery-platform integrations — mirrors `WEATHER_TAGS`/`TRANSIT_TAGS`/`ENTUR_TAGS`, untranslated and never rendered. */
const WOLT_TAGS = ['wolt', 'levering', 'delivery', 'bestilling', 'order', 'takeaway']
const FOODORA_TAGS = ['foodora', 'levering', 'delivery', 'bestilling', 'order', 'takeaway']
const ASSISTANT_TAGS = ['claude', 'anthropic', 'ai', 'assistant', 'assistent', 'chatbot', 'chat']

/**
 * Flattens every searchable entity across the admin dashboard into one
 * memoized `SearchResultEntry[]` — the single source `GlobalSearchPanel`
 * filters against. Each entry's `url` matches exactly what its target
 * view's own deep-link effect (see `ProductsView`, `EventsView`,
 * `IntegrationsView`, `MessageBoardView`, `UsersView`, `ScreensView`,
 * `SettingsView`, `StoreSettingsView`) expects to read via
 * `useSearchParams()` — building a new addressable entity/view should
 * always come with both a deep-link effect *and* an entry here, kept
 * together (see the `admin-deep-links` skill).
 */
export function useGlobalSearchIndex(): SearchResultEntry[] {
  const { t, language } = useLanguage()
  const { session } = useAdminSession()
  const [catalogues] = useCatalogues()
  const [products] = useProducts()
  const [events] = useEvents()
  const [screens] = useScreens()
  const [boards] = useMessageBoards()
  const [posts] = useMessageBoardPosts()
  const [pairingRequests] = useDisplayPairingRequests()
  const [machines] = useDisplayMachines()

  // Users are server-side and session-gated (a `limited` account gets a
  // 403), not one of the synced localStorage hooks above — fetched the
  // same way `UsersView` itself does, kept local to this hook rather than
  // a new shared "users" hook, since nothing else needs this list.
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null)
  useEffect(() => {
    if (!session || session.role === 'limited') return
    listUsers(session.token)
      .then(setUsers)
      .catch(() => {
        // A `limited` account (or an expired session) 403s/401s here — not worth surfacing from a background index build.
      })
  }, [session])

  return useMemo(() => {
    const catalogueEntries: SearchResultEntry[] = catalogues.map((catalogue) => ({
      id: `catalogue:${catalogue.id}`,
      type: 'catalogue',
      title: resolveBilingualField(catalogue.name, language),
      subtitle: t('admin.search.types.catalogue'),
      keywords: [],
      url: `/admin/dashboard/products?catalogueId=${catalogue.id}`,
    }))

    const categoryEntries: SearchResultEntry[] = catalogues.flatMap((catalogue) =>
      catalogue.categories.map((category) => ({
        id: `category:${category.id}`,
        type: 'category',
        title: resolveBilingualField(category.name, language),
        subtitle: resolveBilingualField(catalogue.name, language),
        keywords: [],
        url: `/admin/dashboard/products?catalogueId=${catalogue.id}&categoryId=${category.id}`,
      })),
    )

    const productEntries: SearchResultEntry[] = products.map((product) => {
      const resolved = resolveProductCatalogue(product, catalogues)
      const categoryParam = resolved?.category ? `&categoryId=${resolved.category.id}` : ''
      return {
        id: `product:${product.itemID}`,
        type: 'product',
        title: resolveBilingualField(product.name, language),
        subtitle: resolved?.category ? resolveBilingualField(resolved.category.name, language) : resolved ? t('admin.products.noCategoryColumnLabel') : undefined,
        keywords: [],
        url: resolved ? `/admin/dashboard/products?catalogueId=${resolved.catalogue.id}${categoryParam}&productId=${product.itemID}` : '/admin/dashboard/products',
      }
    })

    const eventEntries: SearchResultEntry[] = events.map((event) => ({
      id: `event:${event.eventID}`,
      type: 'event',
      title: event.title[language],
      subtitle: t('admin.search.types.event'),
      keywords: [],
      url: `/admin/dashboard/events?eventId=${event.eventID}`,
    }))

    const screenEntries: SearchResultEntry[] = screens.map((screen) => ({
      id: `screen:${screen.screenID}`,
      type: 'screen',
      title: screen.name,
      subtitle: t('admin.search.types.screen'),
      keywords: [],
      url: `/admin/dashboard/screens?screenId=${screen.screenID}`,
    }))

    const integrationTypeLabel = t('admin.search.types.integration')
    const integrationEntries: SearchResultEntry[] = [
      {
        id: 'integration:weather',
        type: 'integration',
        title: t('admin.integrations.weatherBrandName'),
        subtitle: integrationTypeLabel,
        keywords: WEATHER_TAGS,
        url: '/admin/dashboard/settings/integrations?integration=weather',
        icon: <YrLogo />,
      },
      {
        id: 'integration:transit',
        type: 'integration',
        title: t('admin.integrations.transitBrandName'),
        subtitle: integrationTypeLabel,
        keywords: TRANSIT_TAGS,
        url: '/admin/dashboard/settings/integrations?integration=transit',
        icon: <FetchedLogo slug="ruter" label={t('admin.integrations.transitBrandName')} />,
      },
      {
        id: 'integration:entur',
        type: 'integration',
        title: t('admin.integrations.enturBrandName'),
        subtitle: integrationTypeLabel,
        keywords: ENTUR_TAGS,
        url: '/admin/dashboard/settings/integrations?integration=entur',
        icon: <FetchedLogo slug="entur" label={t('admin.integrations.enturBrandName')} className="logo-chip" />,
      },
      {
        id: 'integration:news',
        type: 'integration',
        title: t('admin.integrations.newsBrandName'),
        subtitle: integrationTypeLabel,
        keywords: ['nyheter', 'news', 'rss'],
        url: '/admin/dashboard/settings/integrations?integration=news',
        icon: <FetchedLogo slug="rss" label={t('admin.integrations.newsBrandName')} />,
      },
      {
        id: 'integration:wolt',
        type: 'integration',
        title: t('admin.integrations.woltBrandName'),
        subtitle: integrationTypeLabel,
        keywords: WOLT_TAGS,
        url: '/admin/dashboard/settings/integrations?integration=wolt',
        icon: <FetchedLogo slug="wolt" label={t('admin.integrations.woltBrandName')} />,
      },
      {
        id: 'integration:zettle',
        type: 'integration',
        title: 'Zettle',
        subtitle: integrationTypeLabel,
        keywords: ['zettle', 'izettle', 'paypal', 'card', 'kort', 'kortterminal', 'payment', 'betaling', 'register', 'kasse'],
        url: '/admin/dashboard/settings/integrations?integration=zettle',
        icon: <FetchedLogo slug="zettle" label="Zettle" />,
      },
      {
        id: 'integration:vipps',
        type: 'integration',
        title: 'Vipps MobilePay',
        subtitle: integrationTypeLabel,
        keywords: ['vipps', 'mobilepay', 'payment', 'betaling', 'qr', 'register', 'kasse'],
        url: '/admin/dashboard/settings/integrations?integration=vipps',
        icon: <FetchedLogo slug="vipps-mobilepay" label="Vipps MobilePay" />,
      },
      {
        id: 'integration:foodora',
        type: 'integration',
        title: t('admin.integrations.foodoraBrandName'),
        subtitle: integrationTypeLabel,
        keywords: FOODORA_TAGS,
        url: '/admin/dashboard/settings/integrations?integration=foodora',
        icon: <FetchedLogo slug="foodora" label={t('admin.integrations.foodoraBrandName')} />,
      },
      {
        id: 'integration:anthropic',
        type: 'integration',
        title: 'Claude',
        subtitle: integrationTypeLabel,
        keywords: ASSISTANT_TAGS,
        url: '/admin/dashboard/settings/integrations?integration=anthropic',
        icon: <FetchedLogo slug="claude" label="Claude" />,
      },
    ]

    const newsSourceTypeLabel = t('admin.search.types.newsSource')
    const newsSourceEntries: SearchResultEntry[] = NEWS_SOURCES.map((source) => ({
      id: `newsSource:${source.id}`,
      type: 'newsSource',
      title: source.name,
      subtitle: newsSourceTypeLabel,
      keywords: [],
      url: `/admin/dashboard/settings/integrations?integration=news&newsSource=${source.id}`,
      icon: <FetchedLogo slug={source.logoSlug} label={source.name} />,
    }))

    const messageBoardTypeLabel = t('admin.search.types.messageBoard')
    const messageBoardEntries: SearchResultEntry[] = boards.map((board) => ({
      id: `messageBoard:${board.id}`,
      type: 'messageBoard',
      title: board.name,
      subtitle: messageBoardTypeLabel,
      keywords: [],
      url: `/admin/dashboard/messageboard?boardId=${board.id}`,
    }))

    const messageBoardPostEntries: SearchResultEntry[] = posts.map((post) => {
      const board = boards.find((candidate) => candidate.id === post.boardId)
      return {
        id: `messageBoardPost:${post.id}`,
        type: 'messageBoardPost',
        title: post.title,
        subtitle: board?.name,
        keywords: [post.body],
        url: `/admin/dashboard/messageboard?boardId=${post.boardId}&postId=${post.id}`,
      }
    })

    const userEntries: SearchResultEntry[] = (users ?? []).map((user) => ({
      id: `user:${user.id}`,
      type: 'user',
      title: user.username,
      subtitle: t(`admin.users.roles.${user.role}`),
      keywords: [],
      url: `/admin/dashboard/users?userId=${user.id}`,
    }))

    const pairingRequestEntries: SearchResultEntry[] = pairingRequests.map((request) => ({
      id: `pairingRequest:${request.machineID}`,
      type: 'pairingRequest',
      title: request.label,
      subtitle: t('admin.displayManager.pendingBadge'),
      keywords: [],
      url: `/admin/dashboard/displays?pendingMachineId=${request.machineID}`,
    }))

    // Findable by name (its own self-reported label, or an admin's rename). `?updateMachineId=` now
    // opens that machine's own details sheet (and highlights its card behind it) rather than only
    // scrolling to it — everything the link is meant to reach moved into `DisplayDetailsModal`; see
    // `DisplayManagerView.tsx`'s own deep-link effect for that param. The param name is deliberately
    // unchanged so existing links keep working. Every machine, not just `mobile` ones, since this is
    // "find a display by name" generally, not specifically an update-channel search.
    const displayMachineEntries: SearchResultEntry[] = machines.map((machine) => ({
      id: `displayMachine:${machine.machineID}`,
      type: 'displayMachine',
      title: machine.customLabel ?? machine.label,
      subtitle: t(connectionBadgeId(machine.connectionType)),
      keywords: [],
      url: `/admin/dashboard/displays?updateMachineId=${machine.machineID}`,
    }))

    const navSectionEntries: SearchResultEntry[] = NAV_ITEMS.filter((item) => !item.adminOnly || session?.role !== 'limited').map((item) => {
      const NavIcon = ADMIN_NAV_ICONS[item.to]
      return {
        id: `navSection:${item.to}`,
        type: 'navSection',
        title: t(item.id),
        keywords: [],
        url: `/admin/dashboard/${item.to}`,
        icon: <NavIcon />,
      }
    })

    const settingsTypeLabel = t('admin.search.types.settingsPage')
    const settingsPageEntries: SearchResultEntry[] = [
      { id: 'settingsPage:store', type: 'settingsPage', title: t('admin.store.title'), subtitle: settingsTypeLabel, keywords: [], url: '/admin/dashboard/settings/store' },
      {
        id: 'settingsPage:appearance',
        type: 'settingsPage',
        title: t('admin.appearance.title'),
        subtitle: settingsTypeLabel,
        keywords: [],
        url: '/admin/dashboard/settings/store/appearance',
      },
      {
        id: 'settingsPage:contact',
        type: 'settingsPage',
        title: t('admin.contact.title'),
        subtitle: settingsTypeLabel,
        keywords: [],
        url: '/admin/dashboard/settings/store/contact',
      },
      {
        id: 'settingsPage:legal',
        type: 'settingsPage',
        title: t('admin.legal.title'),
        subtitle: settingsTypeLabel,
        keywords: [t('admin.legal.orgNumberLabel'), t('admin.legal.companyNameLabel')],
        url: '/admin/dashboard/settings/store/legal',
      },
      {
        id: 'settingsPage:integrations',
        type: 'settingsPage',
        title: t('admin.settings.integrations.title'),
        subtitle: settingsTypeLabel,
        keywords: [],
        url: '/admin/dashboard/settings/integrations',
      },
      {
        id: 'settingsPage:printers',
        type: 'settingsPage',
        title: t('admin.settings.printers.title'),
        subtitle: settingsTypeLabel,
        keywords: ['printer', 'skriver', 'receipt', 'kvittering', 'ESC/POS'],
        url: '/admin/dashboard/settings/printers',
      },
      {
        id: 'settingsPage:register',
        type: 'settingsPage',
        title: t('admin.settings.register.title'),
        subtitle: settingsTypeLabel,
        keywords: ['register', 'kasse', 'PIN', 'staff', 'ansatt', t('admin.settings.register.staffTitle'), t('admin.settings.register.journalTitle'), t('admin.settings.register.registersTitle'), 'barcode', 'strekkode'],
        url: '/admin/dashboard/settings/register',
      },
      { id: 'settingsPage:developers', type: 'settingsPage', title: t('admin.settings.developersTitle'), subtitle: settingsTypeLabel, keywords: [], url: '/admin/dashboard/settings/developers' },
      ...(session?.role === 'admin'
        ? [
            // Admin only, matching this sub-view's own stricter gate in
            // `SettingsView` and on every `/app-update/*` route — it runs code
            // pulled from GitHub, not just an edit.
            {
              id: 'settingsPage:appupdate',
              type: 'settingsPage' as const,
              title: t('admin.settings.appUpdate.title'),
              subtitle: settingsTypeLabel,
              keywords: t('admin.settings.appUpdate.searchKeywords').split(','),
              url: '/admin/dashboard/settings/appupdate',
            },
          ]
        : []),
      ...(session?.role !== 'limited'
        ? [
            // Same admin/subadmin gate as the row itself in `SettingsView` —
            // a search result that 403s on arrival is worse than no result.
            {
              id: 'settingsPage:website',
              type: 'settingsPage' as const,
              title: t('admin.settings.website.title'),
              subtitle: settingsTypeLabel,
              keywords: t('admin.settings.website.searchKeywords').split(','),
              url: '/admin/dashboard/settings/website',
            },
            { id: 'settingsPage:advanced', type: 'settingsPage' as const, title: t('admin.settings.advanced.title'), subtitle: settingsTypeLabel, keywords: [], url: '/admin/dashboard/settings/advanced' },
            { id: 'settingsPage:backup', type: 'settingsPage' as const, title: t('admin.settings.backup.title'), subtitle: settingsTypeLabel, keywords: [], url: '/admin/dashboard/settings/backup' },
            { id: 'settingsPage:testing', type: 'settingsPage' as const, title: t('admin.settings.testing.title'), subtitle: settingsTypeLabel, keywords: [], url: '/admin/dashboard/settings/testing' },
          ]
        : []),
    ]

    return [
      ...catalogueEntries,
      ...categoryEntries,
      ...productEntries,
      ...eventEntries,
      ...screenEntries,
      ...integrationEntries,
      ...newsSourceEntries,
      ...messageBoardEntries,
      ...messageBoardPostEntries,
      ...userEntries,
      ...pairingRequestEntries,
      ...displayMachineEntries,
      ...navSectionEntries,
      ...settingsPageEntries,
    ]
  }, [catalogues, products, events, screens, boards, posts, users, pairingRequests, machines, language, t, session])
}
