import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import App from './App.tsx'
import { store } from './app/store'
import { AdminLayout } from './features/admin/layout/AdminLayout'
import { AdminDashboard } from './features/admin/layout/AdminDashboard'
import { AdminLogin } from './features/admin/login/AdminLogin'
import { OverviewView } from './features/admin/overview/OverviewView'
import { MessagesView } from './features/admin/messages/MessagesView'
import { ProductsView } from './features/admin/products/ProductsView'
import { EventsView as AdminEventsView } from './features/admin/events/EventsView'
import { ReviewsView } from './features/admin/reviews/ReviewsView'
import { InstagramView } from './features/admin/instagram/InstagramView'
import { ContactInfoView } from './features/admin/contact/ContactInfoView'
import { OrdersView } from './features/admin/orders/OrdersView'
import { ScreensView } from './features/admin/screens/ScreensView'
import { LanguageProvider } from './i18n'
import { Components } from './pages/Components'
import { Events } from './pages/Events'
import { Home } from './pages/Home'
import { Menu } from './pages/Menu'
import { Profile } from './pages/Profile'
import { ScreenDisplay } from './pages/ScreenDisplay'
import './styles/global.scss'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'menu', element: <Menu /> },
      { path: 'events', element: <Events /> },
      { path: 'profile', element: <Profile /> },
      { path: 'components', element: <Components /> },
    ],
  },
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
          { path: 'reviews', element: <ReviewsView /> },
          { path: 'instagram', element: <InstagramView /> },
          { path: 'contact', element: <ContactInfoView /> },
          { path: 'orders', element: <OrdersView /> },
          { path: 'screens', element: <ScreensView /> },
        ],
      },
    ],
  },
  { path: '/screens/:screenId', element: <ScreenDisplay /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <LanguageProvider>
        <RouterProvider router={router} />
      </LanguageProvider>
    </Provider>
  </StrictMode>,
)
