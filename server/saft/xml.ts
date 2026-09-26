/**
 * A minimal XML writer for the SAF-T export: elements in the order they're given (the schema is strict
 * about order), text escaped, and `undefined`/`null` children left out so optional fields just vanish.
 */
import { createHash } from 'node:crypto'

/** One element: its name and either text or child elements. */
export type XmlNode = { name: string; text?: string | number | boolean; children?: (XmlNode | null | undefined | false)[] }

/** An element with text; `null`/`undefined` text leaves the element out. */
export function el(name: string, text: string | number | boolean | null | undefined): XmlNode | null {
  return text === null || text === undefined ? null : { name, text }
}

/** An element with children. */
export function group(name: string, children: (XmlNode | null | undefined | false)[]): XmlNode {
  return { name, children }
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Serialises `node` with two-space indentation. */
export function toXml(node: XmlNode, depth = 0): string {
  const pad = '  '.repeat(depth)
  if (node.children === undefined) return `${pad}<${node.name}>${escape(String(node.text ?? ''))}</${node.name}>`
  const inner = node.children.filter((child): child is XmlNode => Boolean(child)).map((child) => toXml(child, depth + 1))
  return inner.length === 0 ? `${pad}<${node.name}/>` : `${pad}<${node.name}>\n${inner.join('\n')}\n${pad}</${node.name}>`
}

/**
 * An id that fits the schema's `IdentificationString35`. Ids of 35 characters or fewer pass through;
 * longer ones (a product's generated item id can be 40+) keep a readable prefix plus a short hash of the
 * whole id, so the same id always maps to the same value — `artID` and `empID` are keys the transaction
 * lines refer back to, so every occurrence has to shorten identically.
 */
export function saftId(id: string): string
export function saftId(id: string | undefined): string | undefined
export function saftId(id: string | undefined): string | undefined {
  if (id === undefined || id.length <= 35) return id
  return `${id.slice(0, 26)}-${createHash('sha1').update(id).digest('hex').slice(0, 8)}`
}
