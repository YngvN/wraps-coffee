# Release keystore

`release.keystore` is the signing key for every `no.adhdisplay.companion` release build
(`npm run build:tv`, `./gradlew assembleRelease`). It's referenced by
[`../plugins/withReleaseSigning.js`](../plugins/withReleaseSigning.js), which injects a
`signingConfigs.release` block into `android/app/build.gradle` at every `expo prebuild`.

## Why this file is committed, not gitignored

Android refuses to install an update signed with a different key than the one already
installed (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). The only recovery is uninstalling the
app on the TV first, which loses its paired-device state and any local data. Since this
is an internal kiosk app with no Play Store distribution and no CI signing, **git is the
only backup** — losing this file means every future TV update is broken until every
device is manually uninstalled and re-paired. Do not add `keystore/` to `.gitignore`.

## Details

- Alias: `adhdisplay`
- Type: PKCS12
- Generated with:
  ```
  keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore \
    -alias adhdisplay -keyalg RSA -keysize 2048 -validity 10000
  ```

## Passwords

Read from the `ADHDISPLAY_STORE_PASSWORD` / `ADHDISPLAY_KEY_PASSWORD` environment
variables by `plugins/withReleaseSigning.js`, falling back to a literal default baked
into that file so `npm run build:tv` never prompts interactively.

**Both env vars must resolve to the same string.** A PKCS12 keystore does not support a
key password distinct from its store password — if they differ, signing fails at build
time with a password-mismatch error. This isn't a Play Store key and this repo is
private, so a plain committed fallback is an acceptable tradeoff for a build that has to
run non-interactively with no secrets manager involved; if that ever changes, move the
password to a real secret store and update the plugin to require the env var instead of
falling back.

Current fallback password: `AdhDisplayTV2026!` (also present verbatim in
`plugins/withReleaseSigning.js`).
