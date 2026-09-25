import { CODE_PAGE_PC865 } from './escpos'

/** PC865's non-ASCII bytes back to characters — the inverse of `encodePc865`'s table. */
const PC865_REVERSE: Record<number, string> = {
  0x80: 'Ç',
  0x81: 'ü',
  0x82: 'é',
  0x83: 'â',
  0x84: 'ä',
  0x85: 'à',
  0x86: 'å',
  0x87: 'ç',
  0x88: 'ê',
  0x89: 'ë',
  0x8a: 'è',
  0x8b: 'ï',
  0x8c: 'î',
  0x8d: 'ì',
  0x8e: 'Ä',
  0x8f: 'Å',
  0x90: 'É',
  0x91: 'æ',
  0x92: 'Æ',
  0x93: 'ô',
  0x94: 'ö',
  0x95: 'ò',
  0x96: 'û',
  0x97: 'ù',
  0x98: 'ÿ',
  0x99: 'Ö',
  0x9a: 'Ü',
  0x9b: 'ø',
  0x9c: '£',
  0x9d: 'Ø',
  0xa0: 'á',
  0xa1: 'í',
  0xa2: 'ó',
  0xa3: 'ú',
  0xa4: 'ñ',
  0xa5: 'Ñ',
  0xaf: '¤',
  0xf8: '°',
  0xfa: '·',
}

/** One printed line as the paper would show it, with the formatting that was active when it started. */
export interface PreviewLine {
  text: string
  align: 'left' | 'center' | 'right'
  bold: boolean
  /** Character magnification, `[width, height]`. */
  size: [number, number]
}

/** A decoded job: its lines, whether it ends in a cut, and any command this decoder didn't recognise (a bug in the builder, if non-empty). */
export interface ReceiptPreview {
  lines: PreviewLine[]
  cut: boolean
  /** How many drawer-opening pulses the job sent (see `EscPosBuilder.openDrawer`). */
  drawerPulses: number
  codePage: number | null
  unknownCommands: string[]
}

/**
 * Decodes an ESC/POS job produced by `EscPosBuilder` back into lines of text — the reverse of the
 * builder, covering exactly its command set. For tests and for the simulated printer used when no real
 * one is at hand; not a general ESC/POS interpreter.
 */
export function decodeEscPos(bytes: Uint8Array): ReceiptPreview {
  const lines: PreviewLine[] = []
  const unknownCommands: string[] = []
  let align: PreviewLine['align'] = 'left'
  let bold = false
  let size: [number, number] = [1, 1]
  let codePage: number | null = null
  let cut = false
  let drawerPulses = 0
  let current = ''
  let lineStyle: Omit<PreviewLine, 'text'> | null = null

  for (let index = 0; index < bytes.length; index++) {
    const byte = bytes[index]
    if (byte === 0x1b) {
      const command = bytes[++index]
      if (command === 0x40) {
        align = 'left'
        bold = false
        size = [1, 1]
      } else if (command === 0x74) codePage = bytes[++index]
      else if (command === 0x61) align = (['left', 'center', 'right'] as const)[bytes[++index]] ?? 'left'
      else if (command === 0x45) bold = bytes[++index] === 1
      else if (command === 0x70) {
        index += 3
        drawerPulses++
      } else unknownCommands.push(`ESC ${command}`)
    } else if (byte === 0x1d) {
      const command = bytes[++index]
      if (command === 0x21) {
        const value = bytes[++index]
        size = [(value >> 4) + 1, (value & 0x0f) + 1]
      } else if (command === 0x56) {
        index += 2
        cut = true
      } else unknownCommands.push(`GS ${command}`)
    } else if (byte === 0x0a) {
      lines.push({ text: current, ...(lineStyle ?? { align, bold, size }) })
      current = ''
      lineStyle = null
    } else {
      if (lineStyle === null) lineStyle = { align, bold, size }
      current += byte < 0x80 ? String.fromCharCode(byte) : codePage === CODE_PAGE_PC865 ? (PC865_REVERSE[byte] ?? '?') : '?'
    }
  }
  if (current) lines.push({ text: current, ...(lineStyle ?? { align, bold, size }) })
  return { lines, cut, drawerPulses, codePage, unknownCommands }
}

/** A decoded job as plain text roughly the way the paper looks: alignment applied within `width`, bold as `*…*`, enlarged lines marked `[2x]`. */
export function previewAsText(preview: ReceiptPreview, width: number): string {
  return preview.lines
    .map((line) => {
      const room = Math.floor(width / line.size[0])
      const body = line.bold && line.text.trim() ? `*${line.text}*` : line.text
      const placed = line.align === 'center' ? body.padStart(Math.floor((room + body.length) / 2)) : line.align === 'right' ? body.padStart(room) : body
      return line.size[0] > 1 || line.size[1] > 1 ? `${placed}  [${line.size[0]}x${line.size[1]}]` : placed
    })
    .join('\n')
}
