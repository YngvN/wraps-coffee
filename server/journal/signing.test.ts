// Tests for SAF-T signing: the exact signed string, key creation and verification.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { currentSigningKey, formatSignedAmount, signingString, signText, verifySignedText, type SigningKey, type SigningKeyStore } from './signing'

function memoryStore(): SigningKeyStore & { keys: SigningKey[] } {
  const store = { keys: [] as SigningKey[], read: () => store.keys, write: (keys: SigningKey[]) => (store.keys = keys), now: () => new Date('2026-09-25T12:00:00Z') }
  return store
}

test('amounts have two decimals with a point, negatives keep their sign', () => {
  assert.equal(formatSignedAmount(14900), '149.00')
  assert.equal(formatSignedAmount(1943), '19.43')
  assert.equal(formatSignedAmount(5), '0.05')
  assert.equal(formatSignedAmount(-5000), '-50.00')
})

test('the signed string is the six fields joined by semicolons, 0 for the first previous signature', () => {
  assert.equal(signingString('0', '2026-09-25', '14:02:07', 1, 14900, 12957), '0;2026-09-25;14:02:07;1;149.00;129.57')
})

test('a key is made once, is 1024 bits, and its signatures verify', () => {
  const store = memoryStore()
  const key = currentSigningKey(store)
  assert.equal(currentSigningKey(store).privateKeyPem, key.privateKeyPem)
  assert.equal(store.keys.length, 1)
  const text = signingString('0', '2026-09-25', '14:02:07', 1, 14900, 12957)
  const signature = signText(key, text)
  // RSA-1024 signatures are 128 bytes.
  assert.equal(Buffer.from(signature, 'base64').length, 128)
  assert.equal(verifySignedText(key.publicKeyPem, text, signature), true)
  assert.equal(verifySignedText(key.publicKeyPem, text.replace('149.00', '14.90'), signature), false)
})
