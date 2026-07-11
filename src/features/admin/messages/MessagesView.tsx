import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Card, TranslatedText } from '../../../components'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useMessages } from '../../../hooks/useMessages'
import { useLanguage } from '../../../i18n'
import { formatDateTime } from '../../../utils/clockFormat'
import { MessageListItem } from './MessageListItem'
import './MessagesView.scss'

/** Admin inbox of mock customer inquiries. Selecting a message marks it as read. There's no real send/receive backend yet. */
export function MessagesView() {
  const { t, language } = useLanguage()
  const [clockFormat] = useClockFormatPreference()
  const [messages, setMessages] = useMessages()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = messages.find((message) => message.id === selectedId) ?? null

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setMessages(messages.map((message) => (message.id === id ? { ...message, read: true } : message)))
  }

  return (
    <div className="messages-view">
      <TranslatedText as="h1" id="admin.messages.title" />
      <div className="messages-view__layout">
        <div className="messages-view__list">
          {messages.length === 0 ? (
            <p>{t('admin.messages.noMessages')}</p>
          ) : (
            messages.map((message) => (
              <MessageListItem key={message.id} message={message} active={message.id === selectedId} onSelect={() => handleSelect(message.id)} />
            ))
          )}
        </div>
        <Card className="messages-view__detail">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div key={selected.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <h2>{selected.subject}</h2>
                <p className="messages-view__meta">
                  {t('admin.messages.fromLabel')}: {selected.name} ({selected.email})
                </p>
                <p className="messages-view__meta">
                  {t('admin.messages.receivedLabel')}: {formatDateTime(new Date(selected.receivedAt), language, clockFormat)}
                </p>
                <p className="messages-view__body">{selected.message}</p>
              </motion.div>
            ) : (
              <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {t('admin.messages.selectPrompt')}
              </motion.p>
            )}
          </AnimatePresence>
        </Card>
      </div>
    </div>
  )
}
