import type { DisplayMachine } from '../src/types/displayMachine'
import type { EventRecord } from '../src/types/event'
import type { ContactMessage } from '../src/types/message'
import type { MessageBoardPost } from '../src/types/messageBoard'
import type { OrderRecord } from '../src/types/order'
import type { Product } from '../src/types/product'
import { isPostExpired } from '../src/utils/messageBoard'
import { deleteUploadFiles, listUploads } from './uploads'
import * as store from './store'

// Deliberately doesn't import `ScreenConfig`/`ScreenSlot`/`ScreenSlotContent`
// from `../src/types/screen` — that file's own `ScreenSlot.language` field
// pulls in `LanguageCode` from the `../i18n` barrel, which re-exports a real
// React component (`LanguageProvider.tsx`, using `window`/`document`) that
// this project's server-side tsconfig (no DOM lib) can't type-check. Only
// the handful of fields actually read below are declared here instead — a
// narrower, read-only view of the same on-disk JSON shape.
interface MinimalBackgroundImage {
  imageUrl?: string
}
interface MinimalSlotContent {
  kind?: string
  imageUrl?: string
  backgroundImage?: MinimalBackgroundImage
}
interface MinimalScreenSlot {
  backgroundImage: Record<number, MinimalBackgroundImage | undefined>
  content: Record<number, MinimalSlotContent | undefined>
}
interface MinimalScreenConfig {
  backgroundImage?: MinimalBackgroundImage
  paneSlots: Record<string, MinimalScreenSlot>
  draft?: { backgroundImage?: MinimalBackgroundImage; paneSlots?: Record<string, MinimalScreenSlot> }
}

// Nothing in this module ever deletes anything on its own — it only ever
// *computes* what's prunable (`computeCleanupPreview`) so an admin can review
// it, and only actually removes exactly what that admin explicitly confirmed
// (`applyCleanup`), re-checking every single item still qualifies right
// before it's deleted. See "Storage cleanup" in Settings → Backup.

const ORDER_MESSAGE_RETENTION_DAYS = 180
const DISPLAY_MACHINE_STALE_DAYS = 30
// An upload younger than this is never flagged as orphaned, even if nothing
// references it yet — an admin who just uploaded an image and hasn't picked
// where to use it yet (or a product/screen save still in flight) shouldn't
// have that upload vanish out from under them.
const IMAGE_GRACE_PERIOD_MS = 60 * 60 * 1000

function daysAgo(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000
}

/** Pulls the `/uploads/<filename>` part out of a stored image URL — stored as a full `http://<host>/uploads/<filename>` (the host varies with whichever device made the upload), so only the path's own filename is ever comparable against what's actually on disk. */
function extractUploadFilename(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = /\/uploads\/([^/?]+)/.exec(url)
  return match?.[1]
}

function collectSlotImageFilenames(slot: MinimalScreenSlot, into: Set<string>) {
  for (const backgroundImage of Object.values(slot.backgroundImage)) {
    const filename = extractUploadFilename(backgroundImage?.imageUrl)
    if (filename) into.add(filename)
  }
  for (const content of Object.values(slot.content)) {
    if (!content) continue
    const ownBackground = extractUploadFilename(content.backgroundImage?.imageUrl)
    if (ownBackground) into.add(ownBackground)
    if (content.kind === 'image') {
      const filename = extractUploadFilename(content.imageUrl)
      if (filename) into.add(filename)
    }
  }
}

/** Every upload filename currently referenced by any product photo, event image, message-board post image, or screen/pane background/image slide (live *and* unpublished draft state — a draft an admin hasn't published yet still counts as "in use"). */
function collectReferencedImageFilenames(): Set<string> {
  const referenced = new Set<string>()

  const products = (store.get('admin.products')?.value as Product[] | undefined) ?? []
  for (const product of products) {
    const filename = extractUploadFilename(product.image)
    if (filename) referenced.add(filename)
  }

  const events = (store.get('admin.events')?.value as EventRecord[] | undefined) ?? []
  for (const event of events) {
    const filename = extractUploadFilename(event.imageUrl)
    if (filename) referenced.add(filename)
  }

  const posts = (store.get('admin.messageBoardPosts')?.value as MessageBoardPost[] | undefined) ?? []
  for (const post of posts) {
    const filename = extractUploadFilename(post.imageUrl)
    if (filename) referenced.add(filename)
  }

  const screens = (store.get('admin.screens')?.value as MinimalScreenConfig[] | undefined) ?? []
  for (const screen of screens) {
    const topLevelBackground = extractUploadFilename(screen.backgroundImage?.imageUrl)
    if (topLevelBackground) referenced.add(topLevelBackground)
    const draftBackground = extractUploadFilename(screen.draft?.backgroundImage?.imageUrl)
    if (draftBackground) referenced.add(draftBackground)

    for (const slot of Object.values(screen.paneSlots)) collectSlotImageFilenames(slot, referenced)
    for (const slot of Object.values(screen.draft?.paneSlots ?? {})) collectSlotImageFilenames(slot, referenced)
  }

  return referenced
}

export interface PrunableOrder {
  id: string
  createdAt: string
  customerName: string
  totalPrice: number
}

export interface PrunableMessage {
  id: string
  receivedAt: string
  subject: string
  name: string
}

export interface PrunableMessageBoardPost {
  id: string
  title: string
  expiresAt: string
}

export interface PrunableDisplayMachine {
  machineID: string
  label: string
  lastSeenAt: string
}

export interface PrunableImage {
  filename: string
  url: string
  thumbUrl: string
  sizeBytes: number
  uploadedAt: string
}

export interface CleanupPreview {
  retentionDays: number
  displayMachineStaleDays: number
  orders: PrunableOrder[]
  messages: PrunableMessage[]
  messageBoardPosts: PrunableMessageBoardPost[]
  displayMachines: PrunableDisplayMachine[]
  images: PrunableImage[]
}

/** Computes (never deletes) everything currently prunable, for the admin's own review before confirming anything — see `applyCleanup`. */
export function computeCleanupPreview(host: string): CleanupPreview {
  const retentionCutoff = daysAgo(ORDER_MESSAGE_RETENTION_DAYS)
  const staleCutoff = daysAgo(DISPLAY_MACHINE_STALE_DAYS)

  const orders = (store.get('admin.orders')?.value as OrderRecord[] | undefined) ?? []
  const prunableOrders = orders
    .filter((order) => new Date(order.createdAt).getTime() < retentionCutoff)
    .map((order) => ({ id: order.id, createdAt: order.createdAt, customerName: order.customerName, totalPrice: order.totalPrice }))

  const messages = (store.get('admin.messages')?.value as ContactMessage[] | undefined) ?? []
  const prunableMessages = messages
    .filter((message) => new Date(message.receivedAt).getTime() < retentionCutoff)
    .map((message) => ({ id: message.id, receivedAt: message.receivedAt, subject: message.subject, name: message.name }))

  const posts = (store.get('admin.messageBoardPosts')?.value as MessageBoardPost[] | undefined) ?? []
  const prunablePosts = posts
    .filter((post) => isPostExpired(post))
    .map((post) => ({ id: post.id, title: post.title, expiresAt: post.expiresAt as string }))

  const machines = (store.get('admin.displayMachines')?.value as DisplayMachine[] | undefined) ?? []
  const prunableMachines = machines
    .filter((machine) => new Date(machine.lastSeenAt).getTime() < staleCutoff)
    .map((machine) => ({ machineID: machine.machineID, label: machine.label, lastSeenAt: machine.lastSeenAt }))

  const referenced = collectReferencedImageFilenames()
  const now = Date.now()
  const prunableImages = listUploads(host)
    .filter((upload) => upload.kind === 'image' && !referenced.has(upload.filename) && now - new Date(upload.uploadedAt).getTime() > IMAGE_GRACE_PERIOD_MS)
    .map((upload) => ({ filename: upload.filename, url: upload.url, thumbUrl: upload.thumbUrl, sizeBytes: upload.sizeBytes, uploadedAt: upload.uploadedAt }))

  return {
    retentionDays: ORDER_MESSAGE_RETENTION_DAYS,
    displayMachineStaleDays: DISPLAY_MACHINE_STALE_DAYS,
    orders: prunableOrders,
    messages: prunableMessages,
    messageBoardPosts: prunablePosts,
    displayMachines: prunableMachines,
    images: prunableImages,
  }
}

/** What the admin explicitly confirmed deleting, from a `CleanupPreview` they reviewed — an id (or filename) that wasn't actually in that preview is silently ignored rather than trusted blindly. */
export interface CleanupSelection {
  orderIds?: string[]
  messageIds?: string[]
  messageBoardPostIds?: string[]
  displayMachineIds?: string[]
  imageFilenames?: string[]
}

export interface CleanupResult {
  deletedOrders: number
  deletedMessages: number
  deletedMessageBoardPosts: number
  deletedDisplayMachines: number
  deletedImages: number
}

/**
 * Deletes exactly what the admin confirmed — and only what's still true right
 * now: every candidate is re-checked against the same "prunable" condition at
 * this exact moment (not just trusted from whatever the admin's own preview
 * said moments earlier), so something that started being referenced/wasn't
 * actually stale after all is quietly skipped rather than deleted anyway.
 */
export function applyCleanup(selection: CleanupSelection, host: string): CleanupResult {
  const retentionCutoff = daysAgo(ORDER_MESSAGE_RETENTION_DAYS)
  const staleCutoff = daysAgo(DISPLAY_MACHINE_STALE_DAYS)

  const orderIds = new Set(selection.orderIds ?? [])
  const orders = (store.get('admin.orders')?.value as OrderRecord[] | undefined) ?? []
  const ordersToKeep = orders.filter((order) => !(orderIds.has(order.id) && new Date(order.createdAt).getTime() < retentionCutoff))
  const deletedOrders = orders.length - ordersToKeep.length
  if (deletedOrders > 0) store.set('admin.orders', ordersToKeep)

  const messageIds = new Set(selection.messageIds ?? [])
  const messages = (store.get('admin.messages')?.value as ContactMessage[] | undefined) ?? []
  const messagesToKeep = messages.filter((message) => !(messageIds.has(message.id) && new Date(message.receivedAt).getTime() < retentionCutoff))
  const deletedMessages = messages.length - messagesToKeep.length
  if (deletedMessages > 0) store.set('admin.messages', messagesToKeep)

  const postIds = new Set(selection.messageBoardPostIds ?? [])
  const posts = (store.get('admin.messageBoardPosts')?.value as MessageBoardPost[] | undefined) ?? []
  const postsToKeep = posts.filter((post) => !(postIds.has(post.id) && isPostExpired(post)))
  const deletedMessageBoardPosts = posts.length - postsToKeep.length
  if (deletedMessageBoardPosts > 0) store.set('admin.messageBoardPosts', postsToKeep)

  const machineIds = new Set(selection.displayMachineIds ?? [])
  const machines = (store.get('admin.displayMachines')?.value as DisplayMachine[] | undefined) ?? []
  const machinesToKeep = machines.filter((machine) => !(machineIds.has(machine.machineID) && new Date(machine.lastSeenAt).getTime() < staleCutoff))
  const deletedDisplayMachines = machines.length - machinesToKeep.length
  if (deletedDisplayMachines > 0) store.set('admin.displayMachines', machinesToKeep)

  const requestedImageFilenames = new Set(selection.imageFilenames ?? [])
  const referenced = collectReferencedImageFilenames()
  const now = Date.now()
  const stillOrphaned = listUploads(host).filter(
    (upload) =>
      requestedImageFilenames.has(upload.filename) &&
      upload.kind === 'image' &&
      !referenced.has(upload.filename) &&
      now - new Date(upload.uploadedAt).getTime() > IMAGE_GRACE_PERIOD_MS,
  )
  for (const upload of stillOrphaned) deleteUploadFiles(upload.filename)

  return {
    deletedOrders,
    deletedMessages,
    deletedMessageBoardPosts,
    deletedDisplayMachines,
    deletedImages: stillOrphaned.length,
  }
}
