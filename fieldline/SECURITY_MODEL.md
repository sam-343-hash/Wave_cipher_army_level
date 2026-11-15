# FIELDLINE Security Model

Status: **prototype, no independent review, no certification.** FIELDLINE is not "military-grade", not "unhackable", and has not been evaluated by any accredited body. This document states what it does, what it assumes, and where it stops.

## 1. What is protected

| Asset | Protection |
|---|---|
| Incident records, attachments, checklist runs, checklist templates, export metadata, stored package copies | Encrypted at rest with AES-256-GCM under a vault key |
| Evidence packages (`.flpkg`) | AES-256-GCM under a key derived from a separate package passphrase |
| Backups | Rows copied exactly as stored (ciphertext); read only with the vault passphrase |

Stored **in plaintext** (by design, none holds incident content): the vault parameters (salt, iteration count, an encrypted verifier), settings (auto-lock minutes, local translation URL, gesture sensitivity), the security-event log (event types and ids, no content), package ids of imports/exports (random UUIDs), training scores (synthetic), last-verification summary. Test `E17` checks that titles, report text, equipment names and the passphrase do not appear in the stored incident or meta rows.

## 2. Cryptographic design

* **Primitives (Web Crypto only):** SHA-256, PBKDF2-HMAC-SHA256, AES-256-GCM. No custom algorithms.
* **Key derivation:** PBKDF2-HMAC-SHA256, 16-byte random salt, iteration count calibrated on the device to about 350 ms, **never below 600,000** and never above 10,000,000. Packages carrying parameters outside that range are rejected before any derivation (prevents both weak-parameter downgrade and denial of service).
* **Argon2id was not used.** No reviewed Argon2id implementation could be bundled offline in this build. PBKDF2 is weaker against GPU attacks; strong passphrases matter more.
* **Encryption:** AES-256-GCM, a fresh random 96-bit IV for every record and every package.
* **Authenticated metadata:**
  * Vault records: additional data = `{store, id, v}`, so a ciphertext row cannot be copied onto another record.
  * Packages: additional data = the canonical JSON of the whole header (id, created, KDF parameters, salt, IV, cipher, version). Editing any header field makes decryption fail (tested, including a same-length forgery).
* **Versioned formats:** package header `v:1`, manifest `version:1`, record `v:1`, backup `version:1`.
* **Passphrases are never stored** (not in IndexedDB, not in localStorage, not in the DOM after use). The vault key is a non-extractable `CryptoKey` held in memory while unlocked.
* **Memory:** JavaScript cannot guarantee that secrets are erased. Locking drops the key reference; copies may remain until garbage collection. Plaintext of an open incident is in the page's memory while you view it.

## 3. Package integrity

A package contains a manifest listing, for every attachment, name, type, size, offset and SHA-256, plus the event history. On opening, FIELDLINE reports each check individually:

1. Header authenticated and decrypted
2. Package id matches header
3. Each attachment SHA-256
4. The event hash chain
5. The chain head matches the manifest

Structural parsing is defensive: size limits (250 MB file, 4 KB header, 4 MB manifest, 200 attachments, 100 MB attachments), bounds checks on every length and offset, strict schema validation, no HTML insertion. Malformed input produces a clean rejection, never an internal exception (test `6b`).

**Hash chain, honestly:** each event commits to the previous event's hash. This makes accidental or casual alteration, deletion and reordering **evident**. It does **not** stop someone who controls the device or holds the package passphrase from recreating an entire consistent chain. A chain is tamper-evident, not tamper-proof, and it proves nothing about when events really happened.

**Timestamps:** all times come from the device clock. Packages carry an explicit `timeTrust: {verified: false}` warning, shown on every verification. Backwards clock jumps inside a chain are flagged. There is no trusted time source.

**Duplicate detection** refuses to import a package id already imported, or exported from the same vault.

## 4. Gestures are not authentication

Gesture Assist (colour silhouette tracking, open hand / fist / swipe / 2-second hold) is a convenience for navigation. It is **not** biometric authentication, identity verification or a cryptographic key. A silhouette can be reproduced by anyone and misdetected by lighting.

* Gestures can navigate, stop a recording, close dialogs, and confirm only dialogs explicitly marked non-sensitive.
* Deleting data, exporting, erasing, restoring and unlocking always require a button press and, where relevant, a passphrase.
* A red **CAMERA ON** indicator is shown whenever the camera is active; the camera stops when the vault locks.
* Frames are processed in memory at 96x72 and are never stored or transmitted.

## 5. Network behaviour

* No analytics, telemetry, fonts, scripts or images from other origins. The CSP allows `connect-src` only to `self` and `localhost`/`127.0.0.1`.
* The service worker only caches same-origin GET requests.
* Translation: nothing is sent anywhere by default. An optional local LibreTranslate-compatible server must be on `localhost`/`127.0.0.1`; other hosts are refused (tested).
* Browser dictation is behind an explicit consent box with a warning. **Chrome and Edge may stream your voice to the browser vendor's servers** for speech recognition; FIELDLINE cannot prevent that once you consent.
* Test `E15` confirms no request left localhost during a full session.

## 6. Local server hardening

`server.py` binds to `127.0.0.1`, serves only application files (returns 404 for `/tests`, `/docs`, `*.py`, `*.json`, dotfiles), does not log requests, and sends: Content-Security-Policy (`default-src 'none'`, `script-src 'self'`, `style-src 'self'`, no inline script or style, `object-src 'none'`, `frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options`, COOP, CORP, `Permissions-Policy`. All DOM content is created with text nodes; there is no `innerHTML` with user data.

## 7. Threat model

**Reasonably addressed**

* Someone finds a **locked** device or copies the browser profile or a backup, and does not know the passphrase: data is ciphertext; offline guessing cost depends on passphrase strength and PBKDF2.
* A package altered in transit or storage (bit flips, truncation, header edits, swapped attachments): detected and rejected.
* Accidental double-import, malformed or oversized files.
* Accidental network leakage from the application itself.

**Not addressed**

* Malware, a malicious browser extension, a compromised browser or OS, or a keylogger on the device.
* Anyone with access to the **unlocked** session (auto-lock is a mitigation, not a barrier).
* Coercion, shoulder-surfing, weak or reused passphrases, forgotten passphrases (no recovery exists).
* Tampering with the application files themselves: there is no code signing. Whoever can edit the project folder or the local server can change what runs. Treat the folder as trusted code.
* Side channels, timing analysis, secure-erase of memory or disk, forensic recovery of deleted browser storage.
* Authenticity of the **sender** of a package: there are no signatures; a package proves integrity under a passphrase, not who made it.
* Trusted timestamps, legal admissibility, chain-of-custody guarantees.
* Multi-user access control, roles, remote access, key escrow: **not implemented** and not claimed.

## 8. Storage limits

Browser storage can be evicted by the browser under storage pressure or cleared by the user ("clear site data"). The vault passphrase cannot be reset. Make regular backups and keep exported packages. Request persistent storage in the Security Centre.

## 9. Recommended before real-world reliance

Independent security review; replace PBKDF2 with a vetted Argon2id build; add package signing with hardware-backed keys; trusted timestamping; a trained on-device hand-landmark model; code signing or a signed distribution of the app; threat modelling against your actual deployment.
