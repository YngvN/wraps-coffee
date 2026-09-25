/**
 * Scan feedback sounds, generated with WebAudio like the order board's chime (no audio file to ship):
 * - `ok` — one short high beep: the scan did what was expected (added to cart, order handed over);
 * - `attention` — two quick mid beeps: the scan worked but needs staff to look (a draft to confirm, an
 *   order that isn't ready yet, a sold-out item);
 * - `error` — two low buzzes: the scan failed (unknown code, misread, not found, offline).
 * Each tone is distinct by pitch *and* rhythm, so staff can tell them apart without looking.
 */

/** Which feedback to play. */
export type ScanSound = 'ok' | 'attention' | 'error'

/** One tone: pitch in Hz, when it starts and how long it lasts (seconds, relative to "now"). */
interface Tone {
  frequency: number
  at: number
  duration: number
  wave: OscillatorType
}

const SOUNDS: Record<ScanSound, Tone[]> = {
  ok: [{ frequency: 1760, at: 0, duration: 0.09, wave: 'sine' }],
  attention: [
    { frequency: 988, at: 0, duration: 0.08, wave: 'sine' },
    { frequency: 988, at: 0.13, duration: 0.08, wave: 'sine' },
  ],
  error: [
    { frequency: 220, at: 0, duration: 0.16, wave: 'square' },
    { frequency: 196, at: 0.22, duration: 0.2, wave: 'square' },
  ],
}

/** Peak volume per wave shape — a square wave sounds far louder than a sine at the same gain. */
const PEAK_GAIN: Record<OscillatorType, number> = { sine: 0.35, square: 0.12, sawtooth: 0.12, triangle: 0.3, custom: 0.2 }

let context: AudioContext | null = null

/** Plays `sound`. Silently does nothing where audio isn't available (or not yet allowed). */
export function playScanSound(sound: ScanSound): void {
  try {
    context ??= new AudioContext()
    // A context created before any user gesture can start suspended; a tap later lets it resume.
    if (context.state === 'suspended') void context.resume()
    const now = context.currentTime
    for (const tone of SOUNDS[sound]) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = now + tone.at
      oscillator.type = tone.wave
      oscillator.frequency.value = tone.frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(PEAK_GAIN[tone.wave], start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + tone.duration + 0.02)
    }
  } catch {
    // No audio — the on-screen feedback still shows.
  }
}
