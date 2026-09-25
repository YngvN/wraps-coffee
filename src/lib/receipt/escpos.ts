/**
 * A minimal ESC/POS command builder — the command language virtually every receipt printer speaks
 * (Epson TM, Star in ESC/POS mode, Bixolon, Xprinter and the unbranded 58/80 mm printers). Only the
 * handful of commands a receipt needs: reset, code page, alignment, bold, character size, text,
 * feed and cut. Pure and environment-free, so the server (network/system printers) and the kiosk page
 * (a USB printer on the tablet, via the companion) build byte-identical receipts.
 */

const ESC = 0x1b
const GS = 0x1d

/** ESC/POS code page 865 ("PC865 Nordic") — the one that has æ, ø and å. Its `ESC t` number is 5 on Epson and most compatibles. */
export const CODE_PAGE_PC865 = 5

/** Characters outside ASCII that PC865 can print, mapped to their byte. */
const PC865: Record<string, number> = {
  Ç: 0x80,
  ü: 0x81,
  é: 0x82,
  â: 0x83,
  ä: 0x84,
  à: 0x85,
  å: 0x86,
  ç: 0x87,
  ê: 0x88,
  ë: 0x89,
  è: 0x8a,
  ï: 0x8b,
  î: 0x8c,
  ì: 0x8d,
  Ä: 0x8e,
  Å: 0x8f,
  É: 0x90,
  æ: 0x91,
  Æ: 0x92,
  ô: 0x93,
  ö: 0x94,
  ò: 0x95,
  û: 0x96,
  ù: 0x97,
  ÿ: 0x98,
  Ö: 0x99,
  Ü: 0x9a,
  ø: 0x9b,
  '£': 0x9c,
  Ø: 0x9d,
  á: 0xa0,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  ñ: 0xa4,
  Ñ: 0xa5,
  '¤': 0xaf,
  '°': 0xf8,
  '·': 0xfa,
}

/** Typographic characters a receipt might carry (from a customer's note, say), reduced to their plain ASCII look-alike. */
const ASCII_FALLBACKS: Record<string, string> = { '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '×': 'x', '€': 'EUR', ' ': ' ' }

/**
 * Encodes text for code page 865: ASCII as-is, PC865's own accented letters to their byte, a few
 * typographic characters to ASCII look-alikes, anything else stripped of its accent if that leaves
 * ASCII — and otherwise printed as `?`, which is better than the garbage a wrong byte produces.
 * Control characters other than newline are dropped.
 */
export function encodePc865(text: string): number[] {
  const bytes: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0x3f
    if (char === '\n' || (code >= 0x20 && code < 0x7f)) {
      bytes.push(code)
    } else if (char in PC865) {
      bytes.push(PC865[char])
    } else if (char in ASCII_FALLBACKS) {
      for (const fallback of ASCII_FALLBACKS[char]) bytes.push(fallback.charCodeAt(0))
    } else if (code >= 0x20) {
      const stripped = char.normalize('NFD').replace(/[̀-ͯ]/g, '')
      bytes.push(...(/^[\x20-\x7e]+$/.test(stripped) ? [...stripped].map((c) => c.charCodeAt(0)) : [0x3f]))
    }
  }
  return bytes
}

/** Alignment for the lines that follow. */
export type Align = 'left' | 'center' | 'right'

/** Accumulates ESC/POS commands; `bytes()` returns the finished job. Every method returns `this` so a receipt reads top to bottom. */
export class EscPosBuilder {
  private readonly data: number[] = []

  /** Resets the printer's formatting and selects code page 865. Always the first command of a job. */
  init(codePage = CODE_PAGE_PC865): this {
    this.data.push(ESC, 0x40, ESC, 0x74, codePage)
    return this
  }

  align(align: Align): this {
    this.data.push(ESC, 0x61, align === 'center' ? 1 : align === 'right' ? 2 : 0)
    return this
  }

  bold(on: boolean): this {
    this.data.push(ESC, 0x45, on ? 1 : 0)
    return this
  }

  /** Character magnification, 1–8 in each direction. A double-width line holds half as many characters. */
  size(width: number, height: number): this {
    const clamp = (value: number) => Math.min(8, Math.max(1, Math.round(value))) - 1
    this.data.push(GS, 0x21, (clamp(width) << 4) | clamp(height))
    return this
  }

  /** Text without a line break. */
  text(text: string): this {
    this.data.push(...encodePc865(text))
    return this
  }

  /** Text followed by a line break. */
  line(text = ''): this {
    return this.text(text).feed(1)
  }

  feed(lines = 1): this {
    for (let index = 0; index < lines; index++) this.data.push(0x0a)
    return this
  }

  /** Feeds past the cutter and makes a partial cut (the paper stays attached by a tab, so a receipt can't drop on the floor). */
  cut(): this {
    this.data.push(GS, 0x56, 66, 0)
    return this
  }

  /**
   * Opens a cash drawer plugged into the printer's drawer port (ESC p). Drawers are wired to either
   * pin 2 or pin 5 of that port, so both get a pulse (on for 50 ms, off for 500 ms — the common default
   * the printer's own manuals use); a drawer on the other pin simply ignores its pulse.
   */
  openDrawer(): this {
    for (const pin of [0, 1]) this.data.push(ESC, 0x70, pin, 25, 250)
    return this
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.data)
  }
}
