# Football Lab 1.1.1

Personal, free football probability laboratory. Shared standalone HTML and Android app. OpenFootball mode needs no account or token. Optional Football-data.org connection uses a personal free API key. No paid AI, betting placement or staking calculation. App ID: `fr.onbreax.footballlab` (separate from Polylog AI).

## Use

Open `../football-lab.html` in a recent browser, or install the signed APK. Ligue 1, Premier League and La Liga; 2023–24 through 2026–27. Initial data is embedded, so the app opens offline. **Actualiser** manually reloads the three leagues for the selected season from OpenFootball, plus Football-data.org if a key has been entered for this session. A 60-second cooldown prevents repeated refreshes from exhausting the free quota. Network or source failures preserve the existing data. Refreshing the source is not evidence that its results are up to date.

Screens: match analysis, reconstructed standings, locally saved forecasts, and historical walk-forward evaluation. OpenFootball times remain unconfirmed and are never assigned a guessed timezone. Football-data.org TIMED / IN_PLAY / PAUSED / FINISHED timestamps are validated as UTC and displayed in the device timezone, with DST handled by Intl. SCHEDULED dates remain provisional. Recording is allowed before a confirmed kickoff; without one it closes before the UTC match day. Postponed, cancelled, suspended, in-play and conflicting matches cannot receive new predictions. No server-side timestamp certification.

HTML and Android keep separate local storage. Export/import JSON transfers the forecast archive and exact training inputs. A separate Data export/import transfers source datasets between Android and HTML without including keys. An existing forecast for a match is never replaced on import. Export before clearing app/browser data. Android exports with the system document picker and can import user-selected JSON.

## Data provenance

`data/openfootball-snapshot.json` contains the retrieved source files, retrieval timestamp and immutable upstream commit SHA. Source: https://github.com/openfootball/football.json . The upstream project dedicates its schema, data and scripts to the public domain; see its README. The original source names are retained; there is no fuzzy team-name matching. The data adapter normalizes accents, punctuation and FC/CF/AFC/1901 tokens against the embedded registry. Unknown Football-data.org teams are reported and excluded instead of fuzzy-matched. New OpenFootball teams receive the league prior and display a low-history notice.

The 2025–26 snapshot includes 282/306 Ligue 1, 353/380 Premier League and 365/380 La Liga final scores. The newest populated 2026–27 result date in all three datasets at retrieval was 2026-09-20. Missing scores are NOT converted to zero, and displayed coverage reflects only dates before today. Results can be delayed, wrong, corrected or incomplete. Standings omit sanctions and league-specific tie-breakers. Within these double round-robin leagues, an internal match identity combines league, season and ordered home/away team identities, independently of date. Duplicate pairs are rejected as ambiguous. Provider match/team IDs are retained and checked where available. Original forecast records remain unchanged; matching is resolved dynamically. A kickoff moved before the original recording time makes that record ineligible for evaluation.

## Model: original Poisson lissé v1

This is an original baseline implementation, not penaltyblog or Dixon–Coles. No third-party model code is bundled. There is no claim that its parameters have been fitted optimally.

- Uses only scored matches of strictly earlier calendar dates within 1,096 days, separately by league.
- Each match has weight `2^(-age_days / 180)`.
- League weighted home/away goal means form the baseline.
- Team home attack/defence and away attack/defence are shrunk toward their corresponding league goal means with eight pseudo-matches.
- Expected goals = league mean × relevant attack ratio × opponent defence ratio, clipped to [0.15, 5]. These are model goal averages, not shot-derived xG.
- Independent Poisson distributions over 0–24 goals per team, jointly normalized, yield 1/N/2, over/under 2.5 and both-teams-to-score probabilities. At the maximum mean of 5, the omitted tail is negligible, but this remains a truncated model.
- Minimum 60 scored prior matches at league level. Unknown teams use the prior.
- Fixed parameters; no optimization on the displayed evaluation season. No injuries, lineups, player-level information, live match feeds or score correlation adjustment.

The chronological backtest uses the current historical snapshot, not a reconstruction of what the source actually published on every past date. It does not use same-day or future scores. It is separate from the user's prospectively saved forecasts. Incomplete coverage can bias evaluation.

Metrics: multiclass Brier (sum over three outcomes, range 0–2), natural-log loss, favorite-outcome accuracy, home-win calibration in five bins. Reference probabilities are weighted historical league outcome frequencies with one pseudo-observation per outcome. Calibration bins are descriptive, especially unstable with small sample sizes.

## Build

`python3 football-lab/build.py` from the repository root builds `football-lab.html` and Android's embedded HTML. It performs no network request. Both use the same interface and model source.

For Android, install JDK 17, Android platform 35 and build-tools 35.0.0. Set `JAVA_HOME`, `ANDROID_HOME`, `FOOTBALL_KEYSTORE` and `FOOTBALL_KEY_PASSWORD_FILE`, then run `bash football-lab/android/build.sh`. The private signing key must stay outside the repository. No special filesystem access permission is required; only INTERNET is requested.

## Tests

`node football-lab/tests/model.cjs`

`CHROME_EXECUTABLE=/path/to/chromium NODE_PATH=/path/to/node_modules node football-lab/tests/interface.cjs`

Additional v1.1 tests:

`node football-lab/tests/data.cjs`

`CHROME_EXECUTABLE=/path/to/chromium NODE_PATH=/path/to/node_modules node football-lab/tests/calendar-ui.cjs`

Run the data test first; it prepares a synthetic provider fixture in `/tmp`. The calendar UI test checks UTC conversion, reports, preserved forecasts, matching final scores, invalid imports and key privacy. The browser tests require Playwright. It covers mobile/desktop layout, offline data, persistence, archive export/import, malformed import rejection, backtest rendering and offline refresh failures. Model tests check independent probability identities, missing versus nil-nil scores, and future/same-day exclusion. APK compilation/signature checks are not on-device validation.


## Version 1.1 data connection and limitations

Football-data.org documentation and terms checked on 2026-10-09:
- https://www.football-data.org/pricing — free plan: delayed scores/schedules, 10 requests/minute.
- https://www.football-data.org/coverage — FL1, PL, PD included.
- https://docs.football-data.org/general/v4/match.html — stable match/team IDs, UTC timestamps, status lifecycle.
- https://www.football-data.org/about — API attribution required; a key covers a single app in web/mobile form, and must not be placed in a public repository. Data display rights are tied to the subscription; consult the provider's terms before discontinuing it.
- https://www.football-data.org/client/register — personal free registration.

Required attribution is included in the Data panel. No provider artwork is used. The user enters the key in Data, valid for the current page session only; it is not stored, logged or exported. Android requests use a native HTTPS bridge restricted to API host/three competitions and selected season, with timeouts, response size limit and no redirects. Desktop browsers may reject direct API access under CORS. Exporting source data from Android then importing that JSON into HTML is the supported fallback; no third-party public proxy is used.

No authenticated live provider request was tested during development because no personal key was available. API schema/status/error flows were checked against the documentation and synthetic fixtures. The anonymous endpoint returned 403. Source freshness improvement is conditional on a valid key and provider coverage; the bundled OpenFootball snapshot has not been represented as newly updated. TheSportsDB was examined and not integrated: its free season endpoint returned only 15 records, inadequate for our full calendar.

Conflicting final scores are excluded from calculation and shown as data issues. Live scores are never ingested as finals. Cancelled / awarded / suspended / postponed fixtures are tracked as statuses rather than treated as missing finals. Missing IDs in a partial provider response keep previous observations, with a diagnostic. Import rejects wrong competitions, seasons, malformed scores/dates, duplicate identities and unknown team pairings. Source consultation timestamps are distinct from the last known result date. Current source files can still be incomplete or contain errors; this is not an official results service.

The original `src/model.js` is unchanged byte-for-byte from 1.0.0. Previously saved probabilities and snapshots are not rewritten on updates, reports or imports. Historical scores can change with updated data, which is intentional. Archive schema remains backward compatible with v1.

Android 1.1.1 uses versionCode 3, same package and signing certificate as 1.0.0. Install as an update without uninstalling to retain local data. APK compilation/signature verification and browser tests were performed; no physical Android device or emulator test was performed.

## Version 1.1.1 connection diagnostics

Refresh now counts OpenFootball reads and successfully integrated Football-data.org responses separately. A successful OpenFootball request cannot be represented as successful key authentication. The current league/season connection status appears directly below navigation, before any match cards. It distinguishes a key entered but not verified, an in-progress request, network/HTTP failure, a response rejected during validation, and usable provider data with received-match/final-score counts and remaining missing results. Diagnostic details cover each of the three leagues. Checks apply only to the tested season and current key session; they are not retained as a claim of authentication after reopening the app.

The notice is also above the cards. Browser network/CORS failures explain the native Android connection route; the code does not claim to distinguish CORS from an offline network when fetch exposes only a TypeError. Anonymous preflight inspected on 2026-10-09 returned Access-Control-Allow-Origin: http://localhost for an Origin: null request, which does not authorize locally opened HTML or GitHub Pages. No public proxy or API key in a public repository is used. This UI correction cannot supply a result absent from the provider or expand the key's season access. Actual authenticated API access still requires testing with the user's own key on their device.

Both browser and native HTTP errors display their status code. Error text redacts the active key, and changing/forgetting a key is blocked only while an actual refresh is running. Failed OpenFootball validation no longer leaves a partially modified dataset candidate for the other provider. Archives and the mathematical model remain unchanged.

Additional regression: `CHROME_EXECUTABLE=/path/to/chromium NODE_PATH=/path/to/node_modules node football-lab/tests/connection-errors.cjs`. It reproduces successful OpenFootball reads alongside browser API failure, native HTTP 403, and invalid provider data; verifies independent counts, visible mobile diagnostics, data preservation, season-specific status and no key in the UI/storage. The native-bridge connection test also checks a newly received final score while remaining gaps stay explicitly visible. These tests use synthetic responses; APK build/signature checks do not constitute on-device authenticated validation.
