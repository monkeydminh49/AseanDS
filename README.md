# AquaEye

React redesign of the AquaEye aquaculture website, based on the supplied four-screen design. It runs locally with Vite and deploys to GitHub Pages at https://aseandse.labx.ai.vn.

The latest website source was fetched from `monkeydminh49/AseanDS`, commit `cd91ff8` (`Update footer details summary and content`). The original page is preserved in `reference/legacy-index.html`. Existing imagery, news, scripts and Git history are retained. The backup repository could not be updated because its GitHub remote requires authentication; its existing local geographic assets supplement the website source.

## Run locally

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173.

For the compiled site:

```sh
npm run build
npm run preview
```

Run either `dev` or `preview`, not both on the same port.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`. The workflow installs Node dependencies, tests and refreshes publisher headlines, copies the resulting news snapshot into `public/data/news.json`, builds the React application, and publishes only `dist/` to GitHub Pages. The existing `CNAME` preserves the custom domain. Scheduled runs refresh the published news snapshot.

The checked-in files under `public/` are sufficient to build; the reference archive and sibling backup are only needed when regenerating research inputs.

## Optional tunnel access

```sh
# Allow only the exact hostname assigned by your authenticated tunnel:
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=<your-tunnel-hostname> npm run preview
# In a separate terminal, start your tunnel to port 5173.
```

Both the local server and the tunnel must remain running. Access uses the tunnel's authentication.

## Screens

- **Regional overview:** interactive map of 131 provinces, country filter, province search and selection.
- **Monitoring workspace:** Cà Mau satellite context, measured water-change grid, selectable months, gain/loss filters, five prioritized review areas, district aggregation, monthly charts and archived news. Other provinces show their own recorded inventory and historical area.
- **Data & satellites:** draggable Three.js Earth and charts for the source snapshots.
- **Inspection planner:** add review areas, reorder/remove stops, local device persistence and CSV export. Map connections indicate visit order, not driving or boat routes.

## Data

The website and backup embedded observation datasets were compared and are identical. Observations run through August 2026; the dataset was built September 3, 2026. The browser reads local static data files, not a live satellite feed. Provenance is in `public/data/provenance.json`.

`python3 scripts/import-reference.py` extracts the preserved website snapshot and imports supporting map/news assets from the sibling `AseanDSE-backup` folder. It does not execute legacy website JavaScript.

Surface-water change is an inspection signal, not a disease diagnosis. Review areas are approximately 4.4 km × 4.4 km; 10 m describes satellite observations. Pond inventory dates to CLAP 2020 and uses historical administrative boundaries.

Imagery credits: Esri, Vantor, Earthstar Geographics and the GIS User Community; Sentinel-2 research imagery; Earth texture from the Three.js examples. Country outlines: Natural Earth. Fonts: DM Sans and Manrope, with local system-font fallbacks.

## Verification

```sh
npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/aquaeye-browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/aquaeye-browsers node scripts/check-ui.mjs
```

The browser checks cover province search and detail navigation, monthly values, water filters, layer visibility, visit selection/reordering/removal/persistence, exported CSV contents, the Earth renderer, modal keyboard handling and overflow on all four screens at 390 px and 768 px. Screenshots are written to `/tmp/aquaeye-*.png`.
