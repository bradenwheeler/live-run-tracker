# Live run tracker

Public latest-location map for Braden. GitHub Pages serves `docs/`. A Cloudflare Worker with a SQLite-backed Durable Object receives OwnTracks HTTPS updates. No coordinates or credentials are committed to GitHub. Supports a public planned GPX route and a recorded path for the active run. No checkpoint ETAs yet.

## Upload a route and compare your run

1. Open https://live-run-tracker.bradenwheeler.workers.dev/admin and enter your existing ADMIN_TOKEN.
2. Choose a `.gpx` file under 5 MB. The page supports GPX tracks (`trk/trkseg/trkpt`) and routes (`rte/rtept`), including XML namespaces and separate segments. Files containing only waypoints are rejected.
3. Review the route name and point count, then press **Upload & publish route**. Only sanitized coordinates and the route name go to Cloudflare; original GPX timestamps, descriptions, extensions and device metadata stay in your browser. Large routes are sampled to at most 2,500 map points, preserving segment endpoints. Sampling can cut corners, so use the original GPX for navigation.
4. View https://bradenwheeler.github.io/live-run-tracker/ . The planned route is dashed blue. Numbered markers are generated automatically at mile 2, 4, 6, and so on from its GPX start; existing uploaded routes get markers too, without re-uploading. Distances follow the stored GPX geometry, not straight-line distance from the start. Gaps between disconnected GPX segments do not count. Distances are approximate because large GPX files are sampled; exceptionally long routes display at most 1,000 markers. During an active session, OwnTracks updates add a solid green recorded path and the latest-position marker. **Show full route** fits the route; **Center on runner** returns to the latest position. The page polls every minute while visible and reloads route geometry only when it changes.
5. **Start new run** clears the previous actual path and begins a 48-hour session by default (selectable up to 72 hours). The existing OwnTracks connection settings stay the same. All accepted fixes are retained privately in minute buckets during the session; the public path is sampled to at most 1,440 points, starting after deployment and activation; it cannot reconstruct past runs. Gaps over fifteen minutes are not joined by a line.
6. **Stop & clear actual path** removes the marker and recorded path. The planned route remains public while sharing is paused. Use **Remove public route** to remove it. A replacement route changes the plan without resetting the current run.

The route, including its start and finish, is public once uploaded. No uploaded GPX or run coordinates are committed to GitHub. All write operations require the admin token except phone ingestion, which has its separate password. The route is stored separately so session expiry does not erase it. There is no route archive or completed-run archive.

## Deploy (free accounts)

1. GitHub repository **Settings → Pages → Build and deployment → Deploy from a branch → main → /docs → Save**. Enable Enforce HTTPS when available. Expected address: https://bradenwheeler.github.io/live-run-tracker/ . This address is not verified until Pages deployment succeeds.
2. Create or use a Cloudflare account on **Workers Free**. Do not upgrade to Workers Paid. This project uses SQLite Durable Objects, not Workers KV (whose free daily write limit is much smaller).
3. On a computer with Node.js 22+, clone this repo, run `npm install`, then `npx wrangler login` and `npm run deploy`. Cloudflare supplies an HTTPS `https://live-run-tracker.<your-subdomain>.workers.dev` address. No domain purchase required.
4. Generate two DIFFERENT long random passwords in your password manager. Use ASCII characters for the OwnTracks password. In the project directory run `npx wrangler secret put OWNTRACKS_PASSWORD`, then `npx wrangler secret put ADMIN_TOKEN`. Enter the appropriate secret at each hidden prompt. Never place them in public files, URLs, issues, chat, screenshots, or commit history. The admin token controls publishing; the phone password only sends fixes.
5. Set `window.TRACKER_API` in `docs/config.js` to the Worker HTTPS origin (no `/pub`, no trailing slash, no credentials), and commit the change. The page initially displays “Tracker setup in progress” until this is done.
6. Open the Worker's `/admin` page, enter the ADMIN_TOKEN, and use **Start sharing** only when ready to share your precise location publicly. Keep that page available to stop sharing. Tokens are kept in page memory only.

If you prefer not to use terminal commands, ask for help with the Cloudflare deployment. Do not paste your Cloudflare account password or API tokens into chat.

## iPhone OwnTracks settings

Install OwnTracks from the App Store. In OwnTracks open Settings / connection settings (the information icon on versions that use it):

| Setting | Value |
| --- | --- |
| Mode | HTTP (the URL must use HTTPS) |
| URL | `https://live-run-tracker.<your-subdomain>.workers.dev/pub` |
| Authentication | On / HTTP Basic authentication |
| UserID / username | `runner` |
| Password | The private `OWNTRACKS_PASSWORD` you set in Cloudflare |
| DeviceID | `iphone` |
| Tracker ID | `BW` (optional) |
| Secret encryption key | Leave empty; this receiver uses HTTPS, not OwnTracks payload encryption |
| Monitoring mode during a run | Move |

In iPhone Settings → Apps → OwnTracks → Location choose **Always** and turn **Precise Location** on. Allow cellular data and Background App Refresh. Start with a 30-second `locatorInterval` and 25-meter `locatorDisplacement` if those expert settings are available in your app version. Move Mode consumes more battery; iOS and network conditions determine actual delivery timing, so these are targets rather than guarantees. Do not force-quit OwnTracks while tracking.

Start sharing at `/admin`, then manually publish a fresh location from OwnTracks. The HTTP response should be `200` with `[]`. Visit the public map and wait up to a minute. Walk outside, lock the screen, and confirm the location/time advances. Repeat over cellular with Wi-Fi off. After the run, press **Stop & clear** in `/admin`; the API should immediately return `paused` and no point, and open maps clear on their next successful refresh (usually within one minute). Stopping OwnTracks alone does NOT immediately remove the last public point.

## Privacy and failure behavior

Sharing is OFF by default. Every start resets the run and enables publication for 48 hours by default, selectable from 1–72 hours. The current window can be changed without resetting the run. Pause clears the server's point and recorded path. Fixes from before recording activation are discarded. Queued and out-of-order fixes from within the active recording window are retained and reconciled. The latest visible marker still expires after 15 minutes. The live marker exposes latitude, longitude, fix timestamp and accuracy; breadcrumbs expose coordinates and fix timestamps. The route API exposes the sanitized route name, segments and revision. Empty and non-location messages are acknowledged without storing them. Credentials, battery status, device IDs, and topics are never returned publicly. Expired locations disappear; server storage is cleared when the session-expiry alarm runs, or on the next request after expiry. An active run retains up to 1,440 public breadcrumbs plus private session fixes; those clear on stop or expiry. The separately uploaded planned route persists until explicitly removed.

Anyone can copy a public location; stopping cannot retract copies. Map tiles are requested from OpenStreetMap, which can observe the map area and visitor IP. Avoid starting at home or sensitive places. There is no intentional publication delay in this version. The map labels old fixes as “Last known.” A connection failure clears the displayed point instead of implying it is current. This is not an emergency service.

## Free limits and expected use

As checked November 15, 2026: Workers Free includes 100,000 requests/day. SQLite Durable Objects Free includes 100,000 requests/day, 100,000 written rows/day, 5 million read rows/day, 13,000 GB-seconds/day and 5 GB storage. These are account-wide allowances; other projects share them. Exceeding a free limit can stop service until reset, rather than bill for overages on the Free plan.

A phone at one update/30 seconds for 24 hours uses 2,880 requests. Ten viewers for eight hours at one poll/minute add 4,800, totaling about 7,680 requests/day plus starts and retries. The map stops polling hidden tabs. The latest point is overwritten per accepted fix; a bounded breadcrumb array is additionally written as fixes arrive (the public path is sampled to its bounded point budget). The single planned route is capped at 2,500 points / 100 KB. Total storage remains bounded, with no unbounded archive. Each SQLite-backed key-value read/write is billed in rows, including the bounded breadcrumb and route records. Actual OwnTracks update frequency can be higher because displacement also triggers reports. Public traffic or abuse can exhaust limits. Check Cloudflare usage before a large event. No paid plan, custom domain, per-fix GitHub commits, scheduled Actions polling, or metered commercial map API is required.

GitHub Pages uses branch deployment; the only GitHub Action runs tests on code changes. OpenStreetMap's community tiles are appropriate for a small personal map, subject to their usage policy; high traffic would require reviewing the tile provider.

Sources: [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [OwnTracks HTTP authentication](https://owntracks.org/booklet/tech/http/), [OwnTracks location modes](https://owntracks.org/booklet/features/location/), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Tests

`npm test` runs security and lifecycle tests with an in-memory Durable Object storage adapter. Tests cover authentication separation, HTTPS enforcement, body size, coordinate validation, stale/out-of-order/queued points, default pause, explicit clearing, automatic expiry, admin-only route uploads, route limits, segment preservation, route persistence/removal, bounded breadcrumbs, and delayed alarm safety. Browser checks additionally verify GPX tracks/routes, namespaced XML, malformed files, invalid coordinates, sampling, endpoint preservation, file selection and map rendering. They do not replace a deployed Cloudflare integration test or the real iPhone background/cellular acceptance test above.

## Elapsed time and average pace

The public page shows elapsed time from **Start new run**, recorded distance, and average minutes per mile (elapsed seconds divided by actual recorded miles). Stops count toward elapsed time. The clock updates each second; GPS distance refreshes on the existing one-minute poll. Pace appears after 0.1 mile and hides if the latest fix is more than three minutes old. Stop/clear or session expiry clears these public statistics. GPS readings provide an estimate: straight segments between fixes can cut corners, GPS jitter can add distance, and gaps over fifteen minutes are excluded. New fixes accumulate distance independently of breadcrumb sampling. For a session already in progress when this feature deploys, distance initializes from its retained breadcrumbs. New runs reset all metrics.

## Estimated latest route marker

The map projects the latest visible OwnTracks fix onto the nearest segment of the planned route, draws an orange dashed connecting line, and reports the last two-mile marker at or before that projected position. Before mile two it displays “Before mile 2”. The distance sums actual GPX edges and excludes bridges between disconnected segments. This is a geometric estimate, not proof that a checkpoint was passed. A route crossing or overlap can match the wrong part of the route; the earliest position wins an exact tie. The result may move backward if the nearest point moves backward. It clears with the current location on stop, expiry or a connection failure. It does not change the elapsed-time/actual-distance pace calculation.

## Route distance and finish estimates

The public display now shows continuous estimated route mileage from the GPX start, remaining route mileage, estimated time to finish, and the estimated finish date/time in each viewer’s timezone. The nearest-route projection still drives route progress, including its ambiguity at crossings. Finish duration is remaining route meters × (elapsed seconds / projected route meters covered). Average pace still uses actual GPS distance; the finish calculation uses route progress instead. Estimates require 0.1 mile of projected route progress, a recent fix (within three minutes), and an active session. Estimates clear when unavailable, paused, expired, or disconnected. They assume the current overall average pace continues, including stops; the future finish time is an estimate, not an observed actual finish.

## Connection recovery and sparse reports

Receiver requests allow up to 20 seconds. Failed updates retry after 5 seconds, increasing to at most one minute after repeated failures, while normal successful polling remains once per minute. Network/HTTP failures are distinguished from display errors. Report gaps up to 15 minutes now contribute straight-line distance and visible track edges, accommodating OwnTracks reports roughly three minutes apart. Larger gaps are omitted. Existing undercounted sessions are rebuilt from retained breadcrumbs once on upgrade; missing movements between sparse fixes cannot be recovered. More frequent OwnTracks reports improve distance accuracy, especially for loops and turns.

## Editable race start and long sessions

The admin page defaults to a **48-hour recording window**, with choices through **72 hours**. **Apply window to current session** changes expiry without clearing data. Expiry is calculated from recording activation, independent of the corrected race start; loading the session shows the exact date/time. An already-running legacy session retains its old expiry until you explicitly apply a new window.

Use **Load session**, set **Race start** in your local time, then **Save corrected start**. The new time may be any past time, including before activation. Reports from before activation cannot be recovered; the page flags incomplete distance coverage when the race starts earlier than recording. Public elapsed time, path, GPS distance, pace and finish estimates use only fixes at or after that time, with no artificial edge from a pre-start fix. Pre-start reports remain private until stop/expiry so you can correct the time again. Start edits do not extend the recording window. Stop/clear and expiry delete all private session reports and public run data, preserving only the separately uploaded route. Reports stored on the phone during no service can upload later during the active window; historical reports are sorted and duplicate timestamps ignored. Earlier data not collected by the phone cannot be recreated. Long gaps still underestimate path distance.

Private minute buckets have at most 60 distinct timestamped fixes each, spanning at most 72 hours (4,320 buckets). The public path is capped at 1,440 sampled points; distance uses all received fixes. Late batches reconcile once on the next public read. At the suggested 30-second update interval, expect around 2,880 ingests/day; normal viewer traffic and all limits remain subject to the free plans described above.

## Minimal basemap

The map uses OpenFreeMap’s light Positron style, with POIs, house numbers, transit labels and shields suppressed. Route overlays and mile labels remain visible. MapLibre/Leaflet renders the vector basemap; a desaturated OSM raster layer is the fallback if it cannot load. Map credits remain visible. OpenFreeMap states its public instance requires no API key or registration and has no map-view/request limits: https://openfreemap.org/ . This adds no paid map service.
