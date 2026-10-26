# LOCUS

Image geolocation assistant for fact-checkers and OSINT researchers, by [Provereno](https://provereno.media/).

LOCUS sends an image to Google Gemini with Google Maps or Google Search grounding and returns a location hypothesis with the evidence, the queries Google actually executed and the sources it used. The result is a hypothesis for manual verification, not a confirmed location.

## How it works

### **[Try it here with your Gemini API Key](https://provereno-media.github.io/Locus-Geolocation-App/)**

<img width="1437" height="780" alt="locus" src="https://github.com/user-attachments/assets/2881fdc4-1c31-4d56-b9e7-05faeb698c29" />

- **BYOK.** Runs entirely in the browser. Each user enters their own Gemini API key in Settings; the browser calls the Gemini API directly. Provereno servers never receive images or keys. See [ADR-001](docs/adr/ADR-001-access-tiers.md).
- **Google Free tier.** Select **Gemini 2.5 Flash (Free, eligible existing projects)** in Settings. Switching to this model selects **WEB SEARCH**, which is also its default after a reload. Google offers free grounding quotas for this model but restricts access to projects that have used it before; it is not guaranteed for new projects. LOCUS does not automatically switch this selection to a model requiring billing. Checked against Google's [pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash) and [model availability](https://ai.google.dev/gemini-api/docs/models#gemini-2.5-flash) on 2026-10-26; terms and quotas may change.
- **Gemini 3.x.** Search and Maps grounding require a project with billing enabled. The default model remains `gemini-3.6-flash`. Free search allowances on the paid tier do not make model input/output tokens free; see [Google's pricing](https://ai.google.dev/gemini-api/docs/pricing).
- **Pro tier** (planned) will use a Provereno-managed key through a server proxy. Both tiers share the `GeoProvider` interface in `src/services/geo`.

Privacy note: on Google's free tier, submitted content may be used to improve Google products and may be reviewed by humans; with billing enabled, Google's paid-service terms apply.

Export: a result can be copied or saved as a Markdown report, or saved as KML (Google Earth) or GeoJSON (QGIS, uMap). Files are made in the browser; the image itself is not included, only its SHA-256 hash, and file names carry only the date and the start of that hash. Links open the point in Google Maps, Google Earth, OpenStreetMap, Mapillary and Copernicus Browser; opening one sends the coordinates to that service.

Local history: by default the browser keeps the last 20 analyses, including the images, in IndexedDB on the user's device. Saving can be turned off in the History tab; Settings → Clear Local Data deletes the history together with the key and settings. The History tab can export the history to a JSON file and import it back, for backup or moving to another browser; the file holds the images and analysis text without encryption. Import accepts only inline images and web links, and keeps at most the 20 newest analyses.

## Development

Requires Node.js 22.12+ (Vitest 5 does not run on Node 20).

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm test
npm run build      # static files in dist/
```

Enter your Gemini API key in the app's Settings. This BYOK version does not read
`GEMINI_API_KEY` or model settings from `.env.local`, and does not embed the key
in the build. If port 3000 is busy, run `npm run dev -- --port 3001`.

For an eligible Free key, open Settings, enter the key, select **Gemini 2.5 Flash**,
and save. Check that **WEB SEARCH** is active, then upload an image and run analysis.
If Maps returns a quota error for the same key, use WEB SEARCH. If Google rejects
the model itself, check the project's model access in AI Studio; selecting another
model may require billing for grounding. Free quotas can still run out.

To check the production build locally, run `npm run preview` after building.
The HTML CSP supports plain HTTP on localhost, including WebKit-based browsers.
If WebKit cached HTTPS redirects from an older build, use a fresh preview port:
`npm run preview -- --port 4174`.

## Structure

```
src/
  App.tsx                         UI (most of it; to be split into components)
  components/                     UI components (Google Search suggestions frame)
  lib/coords.ts                   coordinate formatting
  lib/exportResult.ts             Markdown, KML and GeoJSON export, map links
  lib/historyStore.ts             local analysis history in IndexedDB
  services/config.ts              settings, model list, local storage
  services/geo/
    types.ts                      GeoProvider interface and result types
    directGeminiProvider.ts       Free tier: browser -> Gemini API
    prompt.ts                     analysis prompt and chat instruction
    schema.ts                     zod validation of model output
    grounding.ts                  sources and queries from grounding metadata
    errors.ts                     error mapping
scripts/eval/                     accuracy evaluation against a set of images
```

## Evaluation

`npm run eval` runs the same analysis code as the app over a set of images with known locations and reports accuracy. The image set lives in a separate private repository (`Provereno-Media/locus-eval`); images are never committed here.

```bash
export LOCUS_EVAL_API_KEY=...       # key with grounding access for the selected model
npm run eval -- --data ../locus-eval --dry-run
npm run eval -- --data ../locus-eval --model gemini-3.6-flash --tool maps --label baseline
# Eligible Free projects:
npm run eval -- --data ../locus-eval --model gemini-2.5-flash --tool search --label free-search
```

Options: `--repeat <n>`, `--only e001,e004`, `--manifest <file>`; `npm run eval -- --help` lists them. Every request uses the key's model and grounding quotas and may be billed according to its tier; `--dry-run` shows the number of requests first. The run stops at errors that would repeat (invalid key, quota, unavailable model).

The report gives the share of answers within 1 / 25 / 200 / 750 / 2500 km and within each image's own radius, the share of correct refusals on images with no answer, calibration of the model's confidence and the number of grounding queries. Errors count as misses. Answers whose grounding sources include provereno.media or the image's published pages are flagged as possible leaks and left out of the accuracy figures. Results are saved to `<data>/runs/`, as they may contain text read from the images.

Node's `fetch` ignores `HTTPS_PROXY`; behind a proxy, set `NODE_USE_ENV_PROXY=1` (Node 22.21+ or 24.5+).

## Deployment

`npm run build` produces a static site in `dist/` with relative asset paths; any static host works, at the domain root or under a sub-path.

**GitHub Pages.** `.github/workflows/deploy-pages.yml` runs typecheck, tests and build on every push to `main` and publishes `dist/`. One-time setup: Settings → Pages → Source: *GitHub Actions*. GitHub Pages cannot send custom HTTP headers, so the CSP below applies only as `<meta>` and `frame-ancestors` is unavailable; the app refuses to render inside a frame instead.

The build injects a Content Security Policy as a `<meta>` tag (`CONTENT_SECURITY_POLICY` in `vite.config.ts`). The host should also send it as an HTTP header, adding `frame-ancestors 'none'`, which browsers ignore in `<meta>`:

```
Content-Security-Policy: <value of CONTENT_SECURITY_POLICY>; upgrade-insecure-requests; frame-ancestors 'none'
```

Add `upgrade-insecure-requests` only on HTTPS hosts, not to local HTTP previews.

When adding a new external service (map tiles, API endpoints, fonts), update the policy, or the browser will block it.
