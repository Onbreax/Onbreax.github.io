# Football Lab 1.2.0

Personal, free football probability laboratory with a fixed original model and an optional, chronologically tuned variant. Shared standalone HTML and Android app. OpenFootball mode needs no account or token. Optional Football-data.org connection uses a personal free API key. No paid AI, betting placement or staking calculation. App ID: `fr.onbreax.footballlab` (separate from Polylog AI).

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

Android 1.2.0 uses versionCode 4, same package and signing certificate as 1.0.0. Install as an update without uninstalling to retain local data. APK compilation/signature verification and browser tests were performed; no physical Android device or emulator test was performed.

## Version 1.1.1 connection diagnostics

Refresh now counts OpenFootball reads and successfully integrated Football-data.org responses separately. A successful OpenFootball request cannot be represented as successful key authentication. The current league/season connection status appears directly below navigation, before any match cards. It distinguishes a key entered but not verified, an in-progress request, network/HTTP failure, a response rejected during validation, and usable provider data with received-match/final-score counts and remaining missing results. Diagnostic details cover each of the three leagues. Checks apply only to the tested season and current key session; they are not retained as a claim of authentication after reopening the app.

The notice is also above the cards. Browser network/CORS failures explain the native Android connection route; the code does not claim to distinguish CORS from an offline network when fetch exposes only a TypeError. Anonymous preflight inspected on 2026-10-09 returned Access-Control-Allow-Origin: http://localhost for an Origin: null request, which does not authorize locally opened HTML or GitHub Pages. No public proxy or API key in a public repository is used. This UI correction cannot supply a result absent from the provider or expand the key's season access. Actual authenticated API access still requires testing with the user's own key on their device.

Both browser and native HTTP errors display their status code. Error text redacts the active key, and changing/forgetting a key is blocked only while an actual refresh is running. Failed OpenFootball validation no longer leaves a partially modified dataset candidate for the other provider. Archives and the mathematical model remain unchanged.

Additional regression: `CHROME_EXECUTABLE=/path/to/chromium NODE_PATH=/path/to/node_modules node football-lab/tests/connection-errors.cjs`. It reproduces successful OpenFootball reads alongside browser API failure, native HTTP 403, and invalid provider data; verifies independent counts, visible mobile diagnostics, data preservation, season-specific status and no key in the UI/storage. The native-bridge connection test also checks a newly received final score while remaining gaps stay explicitly visible. These tests use synthetic responses; APK build/signature checks do not constitute on-device authenticated validation.

## Version 1.2 model comparison

The original `src/model.js` remains byte-for-byte unchanged (SHA-256 `694d66ac71a7ef96b208051639596578e2ec995d2cc26a837b77e325689a60bb`). Its fixed 180-day half-life / 8-match prior is the default. `src/experiment.js` supplies a separate original implementation using the same Poisson goal model with selectable settings. It has no additional runtime dependency or network request. It does not add Dixon–Coles, xG, injuries or lineups.

In **Laboratoire**, press **Comparer les modèles**. The predefined grid is half-lives `[90,180,365]` days × priors `[4,8,16]` equivalent matches (nine combinations, with the original default first for deterministic ties). For the selected league and test season, settings minimize multiclass Brier over walk-forward predictions in the immediately previous season, using only scored dates before the earlier of the test season boundary (July 1) and the as-of day. At least 120 validation matches and 60 prior scored matches per prediction are required. Validation targets, team statistics and parameter selection never use same-day or later results. An insufficient validation season leaves the adjusted variant unavailable.

The selected settings are frozen for the test season. Team strengths are refitted before each test match using only earlier dates and the same 1,096-day history window. This includes earlier test-season results as they become past observations; it does not use them to reselect settings. Both variants are evaluated on the same scored test matches. Brier, natural-log loss and favorite-outcome accuracy are shown side by side. A common historical-frequency reference uses the original 180-day weighting. These are retrospective simulations using the currently available, potentially corrected/incomplete data. They are not a reconstruction of historical publication timing, independent certification, or a guarantee of improvement.

Progress updates yield between candidates/test batches; calculations stay on the device. Results are cached in memory by league, season, as-of day and data revision. A different data revision makes cached comparisons inapplicable. No comparison results, keys or personal settings are sent to a server. Calibration diagrams now cover home win, draw and away win in both Laboratory and saved-forecast tracking. They measure agreement with observed frequencies in five probability bins; they do not automatically recalibrate probabilities. Brier is a combined quality score, not a calibration-only measure.

After comparing, **Initial · v1** / **Ajusté · v2** chooses the model for new calculations/records. The choice is global and retained locally. The adjusted mode selects settings separately for each league and season; a league/season lacking sufficient validation data falls back to the original model. Each card/detail and tracking record identifies the actual model. The original remains the default. Changing a preference or importing/updating source data never rewrites saved predictions, timestamps or snapshots. Tracking indicators describe the records currently selected, which may contain several model versions; the controlled same-match comparison is in Laboratory.

Archive format stays version 1. Old records continue to load, export and import unchanged. A new adjusted record uses model version `poisson-ajuste-2` and adds the chosen settings/selection audit. Its snapshot hash includes the prediction training rows, data revision, model/settings/validation selection and all input rows needed to replay that selection. `tuningInputs` rows are `[date,home,away,homeGoals,awayGoals,season]`; regular prediction training rows keep their original five-field format. The import validator rejects unsupported settings, unknown model versions, inconsistent model metadata and selection/input dates beyond the allowed cutoff. Imported records remain declarative, without a trusted external clock or cryptographic certification of publication.

Tests added:

- `node football-lab/tests/experiment.cjs` — original-model numerical parity, exact original-source hash, normalized outcome calculations, frozen hyperparameters under polluted test results, same-day/future exclusion, common test matches, three-outcome calibration and selection replay from audit inputs.
- `CHROME_EXECUTABLE=/path/to/chromium NODE_PATH=/path/to/node_modules node football-lab/tests/experiment-ui.cjs` — 390/1280 px, legacy archive preservation, comparison/progress, all three calibration outcomes, model selection/reload, adjusted forecast/audit replay, export, and atomic rejection of a future-dated selection. `tests/fixtures/legacy-forecast.json` was generated by the released 1.1.1 HTML with a synthetic 2026-10-09T12:00:00Z clock; it contains no user key or private user forecast. The test is self-contained and requires no downloaded old HTML.

Validation methodology references (consulted 2026-10-09):
- https://scikit-learn.org/stable/modules/cross_validation.html — holdout/validation separation and leakage when choosing settings on test data.
- https://scikit-learn.org/stable/modules/calibration.html — probability bins, observed frequencies, and the distinction between overall Brier quality and calibration.

No scikit-learn code is bundled; these are methodological references for the original JavaScript implementation.

Bundled-data check (2025–26, settings selected on 2024–25; incomplete snapshot, not a prospective result):

| League | Matches | Initial Brier | Adjusted Brier | Half-life / prior |
| --- | ---: | ---: | ---: | --- |
| fr | 282 | 0.588764 | 0.585667 | 365 days / 4 |
| en | 353 | 0.605921 | 0.600526 | 365 days / 4 |
| es | 365 | 0.577606 | 0.573181 | 365 days / 4 |

The bundled current-season test still has only 41/45/64 scored matches (FR/EN/ES), last scored 2026-09-20. The new model does not resolve the unverified authenticated API freshness on the user’s phone. HTML still has the documented browser/CORS restriction; the native Android connection and 1.1.1 diagnostics are preserved. Android build/signature and browser checks do not replace an authenticated on-device test.
