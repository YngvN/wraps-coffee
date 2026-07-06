/** A customer inquiry shown in the admin Messages inbox. */
export interface ContactMessage {
  id: string
  name: string
  email: string
  subject: string
  message: string
  /** ISO date-time string of when the message was received. */
  receivedAt: string
  read: boolean
}
