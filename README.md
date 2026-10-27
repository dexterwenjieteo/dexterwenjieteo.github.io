# Dexter Wen Jie Teo — Academic homepage

A local-first, static Astro site with TypeScript/JSON content and conventional CSS. No backend, UI framework, analytics, external fonts, or browser API keys.

**The website is maintained manually. Live publication refresh is disabled**, including manual API refreshes and automatic checks. The existing Scholar cache is retained as a static snapshot. The integration can be re-enabled later without rebuilding it.

## Start the local preview

Preview: **http://127.0.0.1:4321/** (normally also http://localhost:4321).

On this computer, Node/npm were not on PATH. This helper uses the existing Codex Node runtime and the ignored local npm installation prepared during setup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 dev
```

Keep the terminal open; press Ctrl+C to stop. Changes update the preview automatically. It listens only on loopback, with no public hosting.

`npm run dev` starts only the Astro homepage on port 4321. No publication administration server or live refresh is started. The optional `npm run dev:with-admin` starts both servers; live refresh remains blocked by the setting below.

If the homepage is already running from an earlier session, start only the administration server:

```powershell
npm run admin
# Bundled-runtime equivalent:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 admin
```

The current session URL is also saved in ignored `.local/admin-session.json`. It is an administration credential, not a SerpApi key; keep it private. The API requires it even if the local server is accidentally proxied. Origin and Host checks add protection against cross-site requests and DNS rebinding.

## Manually update and publish

Edit the relevant files in the content table below. Publications belong in `src/data/publications-curated.json`; biography, email, and social links are in `src/data/profile.ts`. Curated information takes precedence over the saved Scholar snapshot. No API key or paid service is needed for manual updates.

Preview with `npm run dev`, then run the checks below. When satisfied, commit your changes and push them to `main` using GitHub Desktop or Git. The **Publish approved homepage** workflow rebuilds and deploys each push to `main`. You can also run that workflow manually from GitHub's Actions tab. Updating content does not run publication synchronization.

For normal use on any computer, install Node.js **22.12 or newer**, including npm, then reopen a terminal in this folder:

```powershell
npm ci
npm run dev
```

Do not run two dev servers together; check Astro's printed address if port 4321 is occupied.

## Check and build

```powershell
npm run check
npm test
npm run build
npm run verify
```

The bundled-runtime equivalents are:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 check
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 verify
```

`check` checks Astro/TypeScript; `test` runs deterministic synchronization and administration security tests; `build` generates `dist/`; `verify` checks the generated page's links, merged publication count, metadata, CV derivative, text contrast, and exclusion of administration code and configured credentials. No linter is configured. To serve the production output, stop the dev server, then run `npm run preview` (or the helper with `preview`). Production preview has no administration service. These commands never publish.

## Review the design

Inspect a wide screen and 375px/390px browser widths. Try navigation, publication filters, both CV links, and keyboard Tab navigation. Toggle the moon/sun button and reload to check persistence. With no saved choice, the site follows the OS theme and its changes; a manual choice takes precedence. A small head script sets the theme before the page paints.

Browser inspection was blocked during the initial session because computer use could not confidently determine Edge's current URL. Desktop/mobile screenshots, visual layout, and interactive theme persistence still need browser review; generated-file checks do not replace that review.

## Update academic content

| Change | File |
| --- | --- |
| Biography, email, social links, headshot, CV date | `src/data/profile.ts` |
| Research themes | `researchThemes` in `src/data/profile.ts` |
| Publications and paper/code/project links | `src/data/publications-curated.json` |
| Cached Scholar records, review queue, and durable UTC sync timestamps | `src/data/publications-scholar.json` |
| Authoritative manual corrections and approved new records | `src/data/publications-overrides.json` |
| Live refresh on/off switch (currently false) | `src/data/publication-settings.json` |
| Research experience | `src/data/experience.ts` |
| Education | `src/data/education.ts` |
| Awards | `src/data/awards.ts` |
| Waterloo course project and NTU elective focuses | `src/data/education.ts` |
| Colours, fonts, spacing, mobile layouts | `src/styles/global.css` |
| Section order | `src/pages/index.astro` |

The homepage uses your square Google Scholar photo at `public/images/portrait.webp`, converted locally from the original HEIC without cropping or retouching. The derivative is resized to at most 800px, converted to sRGB when an embedded colour profile exists, and stripped of EXIF/GPS/XMP metadata. The original HEIC is unchanged and ignored by Git. Square photos are displayed as squares at desktop, tablet, and mobile sizes.

To replace it, put a browser-compatible square image in `public/images/` and update `portrait` in `src/data/profile.ts`. Set `portrait` to `null` to restore the neutral placeholder. The source conversion is recorded in `scripts/prepare-portrait.py` (requires Pillow and pillow-heif). With the currently installed local tools:

```powershell
$env:PYTHONPATH = (Join-Path (Get-Location) '.tools/image-python')
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" scripts/prepare-portrait.py
```

To add a curated publication, copy a JSON object, choose a unique `id`, and edit its fields. Use `links: []` when no verified link exists. Link labels may be `Paper`, `Code`, or `Project`. Types are `workshop`, `manuscript`, `conference`, `journal`, or `preprint`. The Accepted filter follows the explicit status text, so a conference entry does not automatically imply acceptance. Preserve the explicit `Under review` status until an acceptance decision is confirmed. Three configured research-name variants are bolded automatically; Astro escapes content as text.

The five records include the SPIE Medical Imaging 2027 paper, accepted for presentation and not yet published, alongside the original four records. LinkedIn and paper URLs came from the supplied PDF. The robotics code URL is listed in its paper; the distillation code link points to the public `dexterteo4/aortic-temporal-distillation` reference implementation. The Waterloo project is a course project within education, rather than a separate publication or homepage section. Each education entry has a labelled `coursework` list, using the course titles in the CV. Institutional email is the primary contact address.

## Replace the CV safely

The site serves `public/cv/Dexter_Wen_Jie_Teo_CV.pdf`. View and Download point to this file; update the date in `src/data/profile.ts` when replacing it.

The original root PDF stays unmodified and is ignored by Git. The website derivative removes the personal mobile number and the ISLES ranking pending official verification. The AI and Cybersecurity elective focuses are retained at your request, alongside professional email and academic links. Both derivative pages were rendered and visually reviewed. Redactions leave the source layout's original space.

Copy a reviewed, public-safe replacement to the same path and rebuild. **Everything in `public/` enters the static output.** Ignoring a file does not erase it from past Git history.

`scripts/prepare-public-cv.py` records the source-specific redactions; review its rules for any new CV. It uses PyMuPDF, validates the removal, removes telephone URI targets, and renders to ignored `tmp/pdfs/`. With the currently installed tools:

```powershell
$env:PYTHONPATH = (Join-Path (Get-Location) '.tools/python')
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" scripts/prepare-public-cv.py
```

## Template decision

[Scholarly](https://astro.build/themes/details/scholarly/) was evaluated first. Its academic content, theme support, and editorial layout fit well. A smaller custom implementation keeps this single page and the eventual curated JSON/Scholar merge simpler, without the template's additional BibTeX/YAML/Markdown conventions. Content is separated from components and the output is static HTML, with small scripts for themes and filters.

## Configure SerpApi and refresh publications

**Currently disabled.** `liveSyncEnabled` is `false` in `src/data/publication-settings.json`. Both `npm run sync:publications` and `npm run sync:due` return `disabled` without contacting SerpApi or changing the cache/timer. The dashboard disables its live controls. Mock mode remains available. `LOCAL_AUTO_SYNC=false` is also set locally, and no SerpApi key needs to be added to GitHub.

To re-enable later:

1. Change `liveSyncEnabled` to `true` in `src/data/publication-settings.json`.
2. Keep your key in ignored `.env` for local use. Set `LOCAL_AUTO_SYNC=true` only if you want local background checks while the administration server is open.
3. For GitHub-based refresh, add the key as the `SERPAPI_KEY` repository **secret** and set the repository variable `PUBLICATION_SYNC_ENABLED=true`. Both manual and scheduled workflow runs require that variable; the tracked file setting must also be enabled.
4. Commit and push the setting change if enabling refresh on GitHub. The existing rolling schedule resumes from the last successful refresh; a new successful manual refresh resets it.

The sections below document the retained integration for when you choose to enable it.

The live integration uses [SerpApi's Google Scholar Author API](https://serpapi.com/google-scholar-author-api) for `NXlm0_UAAAAJ`. Its published [service terms](https://serpapi.com/legal) apply; use your own permitted account/quota. This integration uses the documented API, not direct scraping.

An ignored `.env` template has been prepared locally. On another checkout, create it once:

```powershell
Copy-Item .env.example .env
```

Open `.env` in your editor and put your key after `SERPAPI_KEY=`. Never paste it into chat or the dashboard, commit it, use a `PUBLIC_` variable, or put it into a URL yourself. The administration server rereads configuration on each request. Environment variables take precedence over `.env`. `LOCAL_AUTO_SYNC=false` disables local background due checks; the tracked liveSyncEnabled switch blocks all live refreshes regardless of credentials.

Open the private dashboard URL printed by `npm run dev` or `npm run admin`. Choose **Live Google Scholar**, then click **Refresh Publications**. The button waits for API validation and an atomic cache commit before reporting success. The dashboard shows the last success, next due date, current status, latest result, and review queue. **Check if due** uses the same logic but skips API requests before the seven-day threshold.

The CLI uses the same implementation:

```powershell
npm run sync:publications
npm run sync:due
npm run sync:mock
```

Bundled-runtime equivalents:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 sync:publications
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 sync:due
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 sync:mock
```

When explicitly enabled, the live server checks whether a refresh is due every minute while it is open and a key is configured. Closing it stops local automatic checks. An initial state without a successful timestamp is due immediately. Each API page can consume quota; pagination is capped at 20 pages and transient failures receive at most two retries. API-supplied pagination URLs are never followed or saved. Errors omit raw request URLs and raw API error messages.

### Safe mock testing

Choose **Mock sandbox** in the dashboard. Successful, duplicate, empty, and failed responses are available. Mock data and timestamps go exclusively to ignored `.local/mock/publications-scholar.json`; they never update the homepage, live cache, or live schedule. A mock success is explicitly labelled **mock-success**. Mock citation counts are synthetic and never enter production. `npm test` also simulates exact UTC timestamps, rather than waiting seven days.

### Curated records, overrides, and review

The site merges curated records, the live Scholar snapshot, and overrides at build time. Exact normalized title matching plus a recognized author name can attach a Scholar link and available citation count to an existing paper. Curated titles, authors, venues, years, links, and publication statuses remain authoritative. Missing API fields do not erase known values. Duplicate titles are collapsed; citation counts are not added together. Cached papers are retained if a later API response omits them.

New or uncertain entries are held in the snapshot's `reviewQueue`. Nothing is considered accepted or published just because it appears on Scholar. To correct an existing paper, add its curated `id` to `records` in `publications-overrides.json`, for example:

```json
{
  "records": {
    "aorta-inr-2026": {
      "status": "Under review",
      "venue": "Medical Image Analysis"
    }
  }
}
```

You can set `hidden: true` to suppress a record, or supply `scholarCitationIds: ["NXlm0_UAAAAJ:actual_id"]` when a manually verified title differs from Scholar. New records require a `records` entry keyed by their exact Scholar citation ID, `approved: true`, an HTTPS `verificationUrl` for the independently verified source, and complete `title`, `authors`, `venue`, `year`, `status`, `type`, `contribution`, and `links` fields. Approval still requires an attributable Scholar author. Alternatively, add a verified paper directly to the curated file. Reload the dev page or rebuild to apply corrections; no API call is needed.

### Rolling seven-day schedule and reliability

The versioned `src/data/publications-scholar.json` stores `lastSuccessfulSync` and `nextScheduledSync` together with the cache and review queue. One atomic file replacement commits them together. The due date is always recalculated as the last successful UTC timestamp plus seven days. A manual success resets it; skips and failures do not. `null` timestamps mean no live success has been recorded.

GitHub Actions performs a **daily due check**, not a fixed weekly refresh. The effective refresh occurs on the first successful scheduled check after the threshold; GitHub schedules can be delayed. This durable state survives rebuilds and redeployments. Local locks prevent overlapping processes; Actions concurrency serializes manual and scheduled runs. A repository push conflict fails instead of overwriting someone else's changes.

Missing keys, empty responses, invalid metadata, wrong profiles, rate limits, network failures, or failed writes preserve the last valid cache and timer. Local result history is in ignored `.local/admin-attempts.json`. After interruption, a lock from a dead process is reclaimed. If a malformed lock remains, first stop all refresh processes, then remove only `.local/locks/live.lock` or `.local/locks/mock.lock` and retry. Do not delete the versioned cache to resolve a lock.

If a live refresh fails, read the dashboard result or CLI error code: `MISSING_KEY` means configure `.env`; `AUTH` means check the account/key; `RATE_LIMIT` means retry later or check quota; `WRONG_AUTHOR` or `INCOMPLETE_RESPONSE` requires inspecting the profile; `WRITE_FAILED` means check local file access. Never include your key in screenshots or troubleshooting messages. A failed refresh does not masquerade as success.

## GitHub Pages hosting

The configured origin is `https://dexterwenjieteo.github.io`, matching this checkout's remote. The build includes canonical/Open Graph metadata, profile structured data, a sitemap, robots.txt, and `.nojekyll`. See [Astro's GitHub Pages guide](https://docs.astro.build/en/guides/deploy/github/).

`deploy.yml` publishes reviewed source pushes to `main` and supports GitHub's authenticated Run workflow interface. `sync-publications.yml` retains the optional refresh implementation, but both manual and scheduled runs are gated by `PUBLICATION_SYNC_ENABLED=true`; leave it unset or false while managing publications manually. The checked-in live-refresh setting provides a second guard. Publication was explicitly authorized after disabling live refresh. Pushing to this public repository exposes the reviewed source and assets.

Initial hosting setup:

1. Review and commit the approved source and public-safe assets; push only to the confirmed repository.
2. Configure Pages to use GitHub Actions.
3. Keep `PUBLICATION_SYNC_ENABLED=false` and do not upload the SerpApi key while using manual updates.
4. Push to `main`, or run **Publish approved homepage** manually from Actions.
5. If live refresh is re-enabled later, use [Refresh publications](https://github.com/dexterwenjieteo/dexterwenjieteo.github.io/actions/workflows/sync-publications.yml) → **Run workflow**. GitHub permissions protect it; the public site never receives a key.

If re-enabled, the sync workflow persists the cache and new successful timestamp even if visible publication content is unchanged. It calls the deployment workflow only when the merged public publication content changes. It does not rely on a bot push triggering a second workflow. The deploy workflow builds the exact source commit; failed sync/build/push steps prevent deployment.

Review `git status` before any future commit. Local tooling, dependencies, build output, credentials, temporary renders, and the original private CV are ignored.
