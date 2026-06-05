# OS Code Signing

There are **two** kinds of signing in QueryDeck — don't confuse them:

1. **Updater signing (minisign)** — ✅ already done. Signs release artifacts so the
   in‑app auto‑updater trusts them. Handled by `tauri-action` + the key in the
   `Prod` GitHub environment. Nothing to buy.
2. **OS code signing** — ⛔ not done. Clears the **Windows SmartScreen** /
   **macOS Gatekeeper** "unverified publisher" warnings. This is what this doc is
   about. It is a *separate* certificate from (1).

Until (2) exists, the README tells users how to click through the one‑time
warning. That's a fine stopgap.

## Cost summary (approximate — verify current rates)

| Platform | Cheapest trusted option | ~Cost/yr |
|---|---|---|
| Linux | nothing needed | $0 |
| Windows | **SignPath Foundation** (OSS) | **$0** |
| Windows | Azure Trusted Signing | ~$120 (needs verified org) |
| Windows | OV / EV certificate | ~$200–700 |
| macOS | Apple Developer Program | **$99** (no free option) |

## Free path

### Linux — already free
`.AppImage` / `.deb` / `.rpm` need no OS certificate. Done.

### Windows — SignPath Foundation (free for open source)
SignPath's foundation signs OSS releases for free **through their cloud service**
(you don't get a raw certificate; SignPath signs your build via their platform,
and the certificate is issued to **"SignPath Foundation"** as the publisher).

**Eligibility checklist** (we appear to qualify — confirm on their site):
- [x] OSI‑approved open‑source license, no commercial dual‑licensing — QueryDeck is MIT ✓
- [x] No proprietary/closed components (system libraries are fine) ✓
- [x] Actively maintained ✓
- [x] Already released in the form to be signed — we publish `.msi`/`.exe` ✓
- [x] Functionality described on the download page — README + release notes ✓
- [ ] Reasonable project reputation (they review this) — may be the weak point for a new repo
- [ ] No malware / PUP ✓

**How to apply:** download SignPath's *OSS Request Form* (an `.xlsx`) from their
open‑source page, fill in project name / repo / details, and email it to them.
They review reputation and verify you control the repository.

**Restrictions to know:**
- Builds must be **automated from source on CI** (they verify the binary matches
  the repo) — our GitHub Actions release already satisfies this.
- **Every release needs manual approval** in SignPath before it's signed.
- You may only sign **your own** binaries.

### macOS — no free option
Gatekeeper requires an Apple **Developer ID** certificate, which needs the
**$99/yr** Apple Developer Program. Notarization is free *with* that membership.
There is no legitimate free way to remove the macOS warning.

## Wiring it into the release workflow

The current `.github/workflows/release.yml` builds + publishes via `tauri-action`
in one step. Adding OS signing differs per platform:

### macOS (`tauri-action` does it for you)
`tauri-action` signs **and notarizes** automatically when these env vars are set
(add them to the `Prod` environment secrets):

```yaml
env:
  APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}            # base64 of the .p12
  APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}  # "Developer ID Application: … (TEAMID)"
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}                  # app‑specific password
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```
No workflow restructuring needed — just the secrets.

### Windows via SignPath (separate signing step)
SignPath signs through *their* service, so `tauri-action`'s built‑in Windows
signing (which expects a local cert/token) doesn't apply. Instead, split the
Windows job: build the unsigned `.msi`/`.exe`, submit them to SignPath for
signing, then attach the signed files to the release. SignPath publishes a
GitHub Action (`signpath/github-action-submit-signing-request`) that uploads a
workflow artifact, waits for signing, and downloads the signed result. You'll
need `SIGNPATH_API_TOKEN` plus your SignPath organization / project / signing‑policy
identifiers as secrets.

> Note: OS signing the `.exe`/`.msi` does **not** change the updater (minisign)
> signature flow — `latest.json` is still signed by our own key. The two are
> independent.

### Windows alternative — Azure Trusted Signing
If SignPath's reputation review is a blocker, Azure Trusted Signing (~$120/yr,
needs a verified org) integrates similarly via a signing step in CI.
