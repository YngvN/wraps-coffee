/**
 * SAF-T Cash Register signatures (Skatteetaten, "Requirements and guidelines for implementing digital
 * signatures in Cash Register Systems"): every cash transaction is signed with RSA-SHA1 using a
 * 1024-bit key, over
 *
 *     previousSignature;transDate;transTime;nr;transAmntIn;transAmntEx
 *
 * where `previousSignature` is the previous signed transaction's signature on the same cash register
 * (`0` for its first), dates are `YYYY-MM-DD`, times `HH:MM:SS`, and amounts have two decimals with a
 * point. The key pair is generated on first use and kept server-only; its public half is what
 * Skatteetaten verifies an export with. Keys are versioned (`keyVersion`), and an old version is kept
 * forever so old signatures stay verifiable.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'

/** One signing key pair. */
export interface SigningKey {
  version: number
  privateKeyPem: string
  publicKeyPem: string
  createdAt: string
}

export interface SigningKeyStore {
  read: () => SigningKey[]
  write: (keys: SigningKey[]) => void
  now: () => Date
}

/** The key size Skatteetaten specifies. */
export const SIGNING_KEY_BITS = 1024

/** A price in øre as the signing string writes it: `14900` → `"149.00"`, `-5000` → `"-50.00"`. */
export function formatSignedAmount(ore: number): string {
  const sign = ore < 0 ? '-' : ''
  const abs = Math.abs(ore)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** The exact string that is signed. */
export function signingString(previousSignature: string, transDate: string, transTime: string, nr: number, amountInOre: number, amountExOre: number): string {
  return [previousSignature, transDate, transTime, String(nr), formatSignedAmount(amountInOre), formatSignedAmount(amountExOre)].join(';')
}

/** The newest key, creating the first one if there is none. */
export function currentSigningKey(store: SigningKeyStore): SigningKey {
  const keys = store.read()
  if (keys.length > 0) return keys.reduce((newest, key) => (key.version > newest.version ? key : newest))
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: SIGNING_KEY_BITS })
  const key: SigningKey = {
    version: 1,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    createdAt: store.now().toISOString(),
  }
  store.write([key])
  return key
}

/** Base64 RSA-SHA1 signature of `text`. */
export function signText(key: SigningKey, text: string): string {
  return sign('sha1', Buffer.from(text, 'utf-8'), createPrivateKey(key.privateKeyPem)).toString('base64')
}

/** Whether `signature` is a valid signature of `text` by `publicKeyPem`. */
export function verifySignedText(publicKeyPem: string, text: string, signature: string): boolean {
  try {
    return verify('sha1', Buffer.from(text, 'utf-8'), createPublicKey(publicKeyPem), Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}
