# expo-updates code signing

**Generated, wired into `app.json`, and now signing manifests end-to-end.**
`codeSigning/certificate.pem` (public, committed) and `codeSigning/private-key.pem`
(gitignored) exist, and `app.json`'s `expo.updates` sets `codeSigningCertificate`/
`codeSigningMetadata` (`keyid: "main"`) pointing at the certificate. See the spec's own
§2.4 for why this exists at all: this hub serves `GET /updates/manifest`/
`GET /updates/assets/:hash` over plain HTTP on a shared café LAN — without code signing,
anyone on that LAN who can spoof the hub can push arbitrary JS to every display.

**Signing happens dynamically, at serve time, not at publish time.** `server/updates.ts`'s
`handleUpdatesManifest` builds the manifest object for the update it's about to serve,
`JSON.stringify`s it once, signs those exact bytes with `private-key.pem` via
`signManifest()` (Node `crypto.createSign('RSA-SHA256')`, PKCS#1 v1.5, base64-encoded —
the `rsa-v1_5-sha256` algorithm declared in `app.json`'s `codeSigningMetadata`), and sends
the same `manifestJson` string as the response body with `expo-signature: sig="...",
keyid="main"` as the response header — computed together, before the single `res.writeHead()`
call, so there is no window where the header and body could ever diverge. This matches the
official Expo Updates reference server pattern; no `signature` field is stored on disk
(`PublishedUpdateMetadata` in `server/updates.ts` has none) since asset URLs are
host-dependent per request and re-signing per-request is what closes that gap. If
`private-key.pem` is missing, `signManifest()` returns `null`, a warning is logged once,
and the manifest is served unsigned rather than the request failing outright.

**Verified** by requesting `/updates/manifest` for a real published update and checking the
returned `expo-signature` against `certificate.pem`'s public key with
`openssl dgst -sha256 -verify` — `Verified OK`.

**Still open:** client-side verification isn't confirmed on a real device — `expo-updates`
is expected to verify against the certificate embedded via `codeSigningCertificate`
automatically once a signed manifest arrives, but this hasn't been exercised end-to-end on
hardware yet (same "needs on-device verification" caveat as the rest of the native-adjacent
work in this plan).

## How this was generated

```
cd adhdisplay-companion
npx expo-updates codesigning:generate \
  --key-output-directory codeSigning \
  --certificate-output-directory codeSigning \
  --certificate-validity-duration-years 10 \
  --certificate-common-name "ADHDisplay Companion"
```

(Run into a separate empty directory and moved into `codeSigning/` afterward — the CLI
refuses to write into a non-empty output directory, and this one already had this file in
it.) Also produced `codeSigning/public-key.pem` — redundant with the public key already
embedded in `certificate.pem`, kept as a convenience artifact, not referenced by any config.

Private key: keep it **out** of the generated `android/` tree and off any machine but the
build toolchain's own, per spec §2.4 — it never needs to leave this folder.

## Why the private key isn't committed like `keystore/release.keystore`

Unlike the release keystore (see `../keystore/KEYSTORE.md`), losing this key doesn't
require uninstalling every device — a lost or rotated code-signing key just means the
next OTA needs a native APK push (Tier 2/3) to embed the new certificate, which this
update channel already supports. Given that recovery path exists, the private half of
this key stays out of git; the public certificate is committed, same as any other build
input.
