import { useEffect, useState } from 'react'
import { Badge, Button, Card, Modal, TranslatedText } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { reportError } from '../../../lib/errorNotifications'
import { createUser, deleteUser, listUsers, resetUserPassword, SessionExpiredError, type AdminUserSummary } from '../../../lib/localServer'
import type { AdminRole, DashboardSection } from '../../../types/sync'
import { ResetPasswordForm } from './ResetPasswordForm'
import { UserForm } from './UserForm'
import './UsersView.scss'

const ROLE_BADGE_VARIANT: Record<AdminRole, 'success' | 'info' | 'neutral'> = {
  admin: 'success',
  subadmin: 'info',
  limited: 'neutral',
}

/** The nav i18n key for one `DashboardSection`'s label — see `UserForm`'s own copy of this mapping. */
function sectionNavId(section: DashboardSection): string {
  return section === 'messageboard' ? 'messageBoard' : section
}

/**
 * Admin dashboard's own account management: every configured user
 * (username, role, and — for a `limited` account — which sections it's
 * scoped to), adding a new one, resetting a password, and deleting one.
 * `admin`/`subadmin` only — hidden from the sidebar entirely for a
 * `limited` session (see `adminNavItems.ts`), and every action here is
 * re-checked server-side regardless of what this view itself shows. A
 * `subadmin` session can do everything an `admin` session can except
 * delete an `admin`-role account or create a new one — both blocked here
 * (disabled delete button, `'admin'` left out of the role picker) purely
 * as a head start on the server's own authoritative check, not the real
 * enforcement.
 */
export function UsersView() {
  const { t } = useLanguage()
  const { session, clearSession } = useAdminSession()
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUserSummary | null>(null)

  const handleSessionExpired = () => {
    reportError(t('imageUpload.sessionExpired'))
    clearSession()
  }

  const refresh = () => {
    if (!session) return
    listUsers(session.token)
      .then(setUsers)
      .catch((error) => {
        if (error instanceof SessionExpiredError) {
          handleSessionExpired()
          return
        }
        reportError(error instanceof Error ? error.message : t('admin.users.loadError'))
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `refresh` is recreated every render (it closes over `session`), including it would refetch on every render instead of only when `session` itself changes.
  useEffect(refresh, [session])

  const availableRoles: AdminRole[] = session?.role === 'admin' ? ['admin', 'subadmin', 'limited'] : ['subadmin', 'limited']
  /** How many accounts currently hold the `admin` role — mirrors `store.adminUserCount()` on the server, computed here too so the last one's own Delete button can be disabled proactively instead of only failing after a click. */
  const adminCount = (users ?? []).filter((user) => user.role === 'admin').length

  const openAddModal = () => {
    setAddError(null)
    setIsAddOpen(true)
  }

  const handleAdd = (input: { username: string; password: string; role: AdminRole; allowedSections?: DashboardSection[] }) => {
    if (!session) return
    setAddError(null)
    setSubmitting(true)
    createUser(session.token, input)
      .then(() => {
        setIsAddOpen(false)
        refresh()
      })
      .catch((error) => {
        if (error instanceof SessionExpiredError) {
          handleSessionExpired()
          return
        }
        setAddError(error instanceof Error ? error.message : t('admin.users.saveError'))
      })
      .finally(() => setSubmitting(false))
  }

  const handleDelete = (user: AdminUserSummary) => {
    if (!session || !window.confirm(t('admin.common.confirmDelete'))) return
    deleteUser(session.token, user.id)
      .then(refresh)
      .catch((error) => {
        if (error instanceof SessionExpiredError) {
          handleSessionExpired()
          return
        }
        reportError(error instanceof Error ? error.message : t('admin.users.deleteError'))
      })
  }

  const handleResetPassword = (password: string) => {
    if (!session || !resetTarget) return
    resetUserPassword(session.token, resetTarget.id, password)
      .then(() => setResetTarget(null))
      .catch((error) => {
        if (error instanceof SessionExpiredError) {
          handleSessionExpired()
          return
        }
        reportError(error instanceof Error ? error.message : t('admin.users.resetPasswordError'))
      })
  }

  return (
    <div className="users-view">
      <div className="users-view__header">
        <TranslatedText as="h1" id="admin.users.title" />
        <Button onClick={openAddModal}>{t('admin.users.addUser')}</Button>
      </div>
      <TranslatedText as="p" id="admin.users.description" className="admin-page-description" />

      <Card>
        {users === null ? (
          <p className="users-view__empty">{t('admin.users.loadingLabel')}</p>
        ) : users.length === 0 ? (
          <p className="users-view__empty">{t('admin.users.noUsers')}</p>
        ) : (
          <ul className="users-view__list">
            {users.map((user) => {
              const isSelf = user.username === session?.username
              const isLastAdmin = user.role === 'admin' && adminCount <= 1
              const canDelete = !isSelf && !isLastAdmin && (user.role !== 'admin' || session?.role === 'admin')
              const deleteTitle = isSelf
                ? t('admin.users.cantDeleteSelf')
                : isLastAdmin
                  ? t('admin.users.cantDeleteLastAdmin')
                  : !canDelete
                    ? t('admin.users.cantDeleteAdmin')
                    : undefined
              return (
                <li key={user.id} className="users-view__item">
                  <div className="users-view__item-info">
                    <span className="users-view__item-name">{user.username}</span>
                    <Badge variant={ROLE_BADGE_VARIANT[user.role]}>{t(`admin.users.roles.${user.role}`)}</Badge>
                    {user.role === 'limited' &&
                      (user.allowedSections ?? []).map((section) => (
                        <Badge key={section} variant="neutral">
                          {t(`admin.nav.${sectionNavId(section)}`)}
                        </Badge>
                      ))}
                  </div>
                  <div className="users-view__item-actions">
                    <Button variant="secondary" onClick={() => setResetTarget(user)}>
                      {t('admin.users.resetPasswordButton')}
                    </Button>
                    <Button variant="secondary" onClick={() => handleDelete(user)} disabled={!canDelete} title={deleteTitle}>
                      {t('admin.common.delete')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Modal open={isAddOpen} onClose={() => setIsAddOpen(false)} title={t('admin.users.addUser')}>
        {isAddOpen && <UserForm availableRoles={availableRoles} onSave={handleAdd} onCancel={() => setIsAddOpen(false)} error={addError} submitting={submitting} />}
      </Modal>

      <Modal open={resetTarget !== null} onClose={() => setResetTarget(null)} title={resetTarget ? t('admin.users.resetPasswordTitle', { username: resetTarget.username }) : undefined}>
        {resetTarget && <ResetPasswordForm onSave={handleResetPassword} onCancel={() => setResetTarget(null)} />}
      </Modal>
    </div>
  )
}
