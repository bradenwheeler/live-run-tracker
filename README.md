# Live run tracker

Public latest-location map for Braden. GitHub Pages serves `docs/`. A Cloudflare Worker with a SQLite-backed Durable Object receives OwnTracks HTTPS updates. No coordinates or credentials are committed to GitHub. No route history, GPX, or ETAs yet.

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

Sharing is OFF by default. Every start resets the point and enables publication for at most six hours; start again to extend a longer run. Pause clears the server's point. Fixes older than 15 minutes, from before the sharing session, or out of order are discarded. The public API exposes only latitude, longitude, fix timestamp and accuracy. Empty and non-location messages are acknowledged without storing them. Credentials, battery status, device IDs, and topics are never returned publicly. Expired locations disappear; server storage is cleared when the six-hour alarm runs, or on the next request after expiry. Only one point is retained, no history.

Anyone can copy a public location; stopping cannot retract copies. Map tiles are requested from OpenStreetMap, which can observe the map area and visitor IP. Avoid starting at home or sensitive places. There is no intentional publication delay in this version. The map labels old fixes as “Last known.” A connection failure clears the displayed point instead of implying it is current. This is not an emergency service.

## Free limits and expected use

As checked November 15, 2026: Workers Free includes 100,000 requests/day. SQLite Durable Objects Free includes 100,000 requests/day, 100,000 written rows/day, 5 million read rows/day, 13,000 GB-seconds/day and 5 GB storage. These are account-wide allowances; other projects share them. Exceeding a free limit can stop service until reset, rather than bill for overages on the Free plan.

A phone at one update/30 seconds for 24 hours uses 2,880 requests. Ten viewers for eight hours at one poll/minute add 4,800, totaling about 7,680 requests/day plus starts and retries. The map stops polling hidden tabs. One small point is overwritten per accepted fix, so storage does not grow over time. Actual OwnTracks update frequency can be higher because displacement also triggers reports. Public traffic or abuse can exhaust limits. Check Cloudflare usage before a large event. No paid plan, custom domain, per-fix GitHub commits, scheduled Actions polling, or metered commercial map API is required.

GitHub Pages uses branch deployment; the only GitHub Action runs tests on code changes. OpenStreetMap's community tiles are appropriate for a small personal map, subject to their usage policy; high traffic would require reviewing the tile provider.

Sources: [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [OwnTracks HTTP authentication](https://owntracks.org/booklet/tech/http/), [OwnTracks location modes](https://owntracks.org/booklet/features/location/), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Tests

`npm test` runs security and lifecycle tests with an in-memory Durable Object storage adapter. Tests cover authentication separation, HTTPS enforcement, body size, coordinate validation, stale/out-of-order/queued points, default pause, explicit clearing and automatic expiry. They do not replace a deployed Cloudflare integration test or the real iPhone background/cellular acceptance test above.
