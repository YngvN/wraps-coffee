import { Navigate } from 'react-router-dom'
import { useAdminSession } from '../../../hooks/useAdminSession'

/**
 * Top-level catch-all for any URL outside `/admin/login`, `/admin/dashboard/*`
 * and `/screens/:screenId` (e.g. a stray `/admin/typo` or a bare `/whatever`).
 * Logged out → straight to login, same as any other admin route. Logged in
 * → into the dashboard shell's own `NotFoundView` (its `*` child route),
 * rather than silently landing on Overview with no explanation.
 */
export function NotFoundRedirect() {
  const { session } = useAdminSession()
  return <Navigate to={session ? '/admin/dashboard/not-found' : '/admin/login'} replace />
}
