import { useEffect, useMemo, useState } from 'react'
import { FetchedLogo, YrLogo } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useEvents } from '../../../hooks/useEvents'
import { useMessageBoardPosts } from '../../../hooks/useMessageBoardPosts'
import { useMessageBoards } from '../../../hooks/useMessageBoards'
import { useProducts } from '../../../hooks/useProducts'
import { useScreens } from '../../../hooks/useScreens'
import { useLanguage } from '../../../i18n'
import { listUsers, type AdminUserSummary } from '../../../lib/localServer'
import { NEWS_SOURCES } from '../../../types/news'
import { ENTUR_TAGS, TRANSIT_TAGS, WEATHER_TAGS } from '../integrations/integrationSearchTags'
import { ADMIN_NAV_ICONS, NAV_ITEMS } from '../layout/adminNavItems'
import type { SearchResultEntry } from './searchTypes'

/** Search-only keywords for the two delivery-platform integrations — mirrors `WEATHER_TAGS`/`TRANSIT_TAGS`/`ENTUR_TAGS`, untranslated and never rendered. */
const WOLT_TAGS = ['wolt', 'levering', 'delivery', 'bestilling', 'order', 'takeaway']
const FOODORA_TAGS = ['foodora', 'levering', 'delivery', 'bestilling', 'order', 'takeaway']

/**
 * Flattens every searchable entity across the admin dashboard into one
 * memoized `SearchResultEntry[]` — the single source `GlobalSearchPanel`
 * filters against. Each entry's `url` matches exactly what its target
 * view's own deep-link effect (see `ProductsView`, `EventsView`,
 * `IntegrationsView`, `MessageBoardView`, `UsersView`, `ScreensView`,
 * `SettingsView`, `StoreSettingsView`) expects to read via
 * `useSearchParams()` — building a new addressable entity/view should
 * always come with both a deep-link effect *and* an entry here, kept
 * together (see the "Deep-linkable admin views" section in `CLAUDE.md`).
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
      title: catalogue.name[language],
      subtitle: t('admin.search.types.catalogue'),
      keywords: [],
      url: `/admin/dashboard/products?catalogueId=${catalogue.id}`,
    }))

    const categoryEntries: SearchResultEntry[] = catalogues.flatMap((catalogue) =>
      catalogue.categories.map((category) => ({
        id: `category:${category.id}`,
        type: 'category',
        title: category.name[language],
        subtitle: catalogue.name[language],
        keywords: [],
        url: `/admin/dashboard/products?catalogueId=${catalogue.id}&categoryId=${category.id}`,
      })),
    )

    const productEntries: SearchResultEntry[] = products.map((product) => {
      const catalogue = catalogues.find((candidate) => candidate.categories.some((category) => category.id === product.category))
      const category = catalogue?.categories.find((candidate) => candidate.id === product.category)
      return {
        id: `product:${product.itemID}`,
        type: 'product',
        title: product.name[language],
        subtitle: category?.name[language],
        keywords: [],
        url: catalogue && category ? `/admin/dashboard/products?catalogueId=${catalogue.id}&categoryId=${category.id}&productId=${product.itemID}` : '/admin/dashboard/products',
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
        url: '/admin/dashboard/settings?view=integrations&integration=weather',
        icon: <YrLogo />,
      },
      {
        id: 'integration:transit',
        type: 'integration',
        title: t('admin.integrations.transitBrandName'),
        subtitle: integrationTypeLabel,
        keywords: TRANSIT_TAGS,
        url: '/admin/dashboard/settings?view=integrations&integration=transit',
        icon: <FetchedLogo slug="ruter" label={t('admin.integrations.transitBrandName')} />,
      },
      {
        id: 'integration:entur',
        type: 'integration',
        title: t('admin.integrations.enturBrandName'),
        subtitle: integrationTypeLabel,
        keywords: ENTUR_TAGS,
        url: '/admin/dashboard/settings?view=integrations&integration=entur',
        icon: <FetchedLogo slug="entur" label={t('admin.integrations.enturBrandName')} className="logo-chip" />,
      },
      {
        id: 'integration:news',
        type: 'integration',
        title: t('admin.integrations.newsBrandName'),
        subtitle: integrationTypeLabel,
        keywords: ['nyheter', 'news', 'rss'],
        url: '/admin/dashboard/settings?view=integrations&integration=news',
        icon: <FetchedLogo slug="rss" label={t('admin.integrations.newsBrandName')} />,
      },
      {
        id: 'integration:wolt',
        type: 'integration',
        title: t('admin.integrations.woltBrandName'),
        subtitle: integrationTypeLabel,
        keywords: WOLT_TAGS,
        url: '/admin/dashboard/settings?view=integrations&integration=wolt',
        icon: <FetchedLogo slug="wolt" label={t('admin.integrations.woltBrandName')} />,
      },
      {
        id: 'integration:foodora',
        type: 'integration',
        title: t('admin.integrations.foodoraBrandName'),
        subtitle: integrationTypeLabel,
        keywords: FOODORA_TAGS,
        url: '/admin/dashboard/settings?view=integrations&integration=foodora',
        icon: <FetchedLogo slug="foodora" label={t('admin.integrations.foodoraBrandName')} />,
      },
    ]

    const newsSourceTypeLabel = t('admin.search.types.newsSource')
    const newsSourceEntries: SearchResultEntry[] = NEWS_SOURCES.map((source) => ({
      id: `newsSource:${source.id}`,
      type: 'newsSource',
      title: source.name,
      subtitle: newsSourceTypeLabel,
      keywords: [],
      url: `/admin/dashboard/settings?view=integrations&integration=news&newsSource=${source.id}`,
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
      { id: 'settingsPage:store', type: 'settingsPage', title: t('admin.store.title'), subtitle: settingsTypeLabel, keywords: [], url: '/admin/dashboard/settings?view=store' },
      {
        id: 'settingsPage:appearance',
        type: 'settingsPage',
        title: t('admin.appearance.title'),
        subtitle: settingsTypeLabel,
        keywords: [],
        url: '/admin/dashboard/settings?view=store&section=appearance',
      },
      {
        id: 'settingsPage:integrations',
        type: 'settingsPage',
        title: t('admin.settings.integrations.title'),
        subtitle: settingsTypeLabel,
        keywords: [],
        url: '/admin/dashboard/settings?view=integrations',
      },
      { id: 'settingsPage:developers', type: 'settingsPage', title: t('admin.settings.developersTitle'), subtitle: settingsTypeLabel, keywords: [], url: '/admin/dashboard/settings?view=developers' },
      ...(session?.role !== 'limited'
        ? [
            { id: 'settingsPage:advanced', type: 'settingsPage' as const, title: t('admin.settings.advanced.title'), subtitle: settingsTypeLabel, keywords: [], url: '/admin/dashboard/settings?view=advanced' },
            { id: 'settingsPage:backup', type: 'settingsPage' as const, title: t('admin.settings.backup.title'), subtitle: settingsTypeLabel, keywords: [], url: '/admin/dashboard/settings?view=backup' },
            { id: 'settingsPage:testing', type: 'settingsPage' as const, title: t('admin.settings.testing.title'), subtitle: settingsTypeLabel, keywords: [], url: '/admin/dashboard/settings?view=testing' },
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
      ...navSectionEntries,
      ...settingsPageEntries,
    ]
  }, [catalogues, products, events, screens, boards, posts, users, language, t, session])
}
