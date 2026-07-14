import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AdminLayout } from './features/admin/layout/AdminLayout'
import { AdminDashboard } from './features/admin/layout/AdminDashboard'
import { AdminLogin } from './features/admin/login/AdminLogin'
import { OverviewView } from './features/admin/overview/OverviewView'
import { MessagesView } from './features/admin/messages/MessagesView'
import { ProductsView } from './features/admin/products/ProductsView'
import { EventsView as AdminEventsView } from './features/admin/events/EventsView'
import { StoreSettingsView } from './features/admin/store/StoreSettingsView'
import { ImageLibraryView } from './features/admin/imageLibrary/ImageLibraryView'
import { OrdersView } from './features/admin/orders/OrdersView'
import { ScreensView } from './features/admin/screens/ScreensView'
import { ExtensionsView } from './features/admin/extensions/ExtensionsView'
import { MessageBoardView } from './features/admin/messageBoard/MessageBoardView'
import { SettingsView } from './features/admin/settings/SettingsView'
import { NotFoundRedirect } from './features/admin/layout/NotFoundRedirect'
import { NotFoundView } from './features/admin/layout/NotFoundView'
import { StoreBrandingEffect } from './features/admin/layout/StoreBrandingEffect'
import { UsersView } from './features/admin/users/UsersView'
import { LanguageProvider } from './i18n'
import { ScreenDisplay } from './pages/ScreenDisplay'
import './styles/global.scss'

// The public customer-facing site now lives in its own separate project
// (deployed to Netlify, backed by Neon) — this repo is just the admin
// dashboard and the kiosk/screens display, run against the local LAN server.
const router = createBrowserRouter([
  { index: true, element: <Navigate to="/admin/login" replace /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { path: 'login', element: <AdminLogin /> },
      {
        path: 'dashboard',
        element: <AdminDashboard />,
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          { path: 'overview', element: <OverviewView /> },
          { path: 'messages', element: <MessagesView /> },
          { path: 'products', element: <ProductsView /> },
          { path: 'events', element: <AdminEventsView /> },
          { path: 'store', element: <StoreSettingsView /> },
          { path: 'orders', element: <OrdersView /> },
          { path: 'screens', element: <ScreensView /> },
          { path: 'extensions', element: <ExtensionsView /> },
          { path: 'messageboard', element: <MessageBoardView /> },
          { path: 'images', element: <ImageLibraryView /> },
          { path: 'users', element: <UsersView /> },
          { path: 'settings', element: <SettingsView /> },
          { path: '*', element: <NotFoundView /> },
        ],
      },
    ],
  },
  { path: '/screens/:screenId', element: <ScreenDisplay /> },
  { path: '*', element: <NotFoundRedirect /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <StoreBrandingEffect />
      <RouterProvider router={router} />
    </LanguageProvider>
  </StrictMode>,
)
