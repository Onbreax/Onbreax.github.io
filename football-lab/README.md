# Football Lab 1.0.0

Personal, free football probability laboratory. Shared standalone HTML and Android app. No account, API token, paid AI, betting placement or staking calculation. App ID: `fr.onbreax.footballlab` (separate from Polylog AI).

## Use

Open `../football-lab.html` in a recent browser, or install the signed APK. Ligue 1, Premier League and La Liga; 2023–24 through 2026–27. Initial data is embedded, so the app opens offline. **Actualiser** manually reloads the three 2026–27 datasets from OpenFootball. Network or source failures preserve the existing data. Refreshing the source is not evidence that its results are up to date.

Screens: match analysis, reconstructed standings, locally saved forecasts, and historical walk-forward evaluation. No kickoff time is presented because the source timezone has not been verified. Saved predictions are permitted only for match dates strictly after today's UTC date, using the device clock. This deliberately excludes same-day recording. No server-side timestamp certification.

HTML and Android keep separate local storage. Export/import JSON transfers the forecast archive and exact training inputs. An existing forecast for a match is never replaced on import. Export before clearing app/browser data. Android exports with the system document picker and can import user-selected JSON.

## Data provenance

`data/openfootball-snapshot.json` contains the retrieved source files, retrieval timestamp and immutable upstream commit SHA. Source: https://github.com/openfootball/football.json . The upstream project dedicates its schema, data and scripts to the public domain; see its README. The original source names are retained; there is no fuzzy team-name matching. New or renamed teams receive the league prior and display a low-history notice.

The 2025–26 snapshot includes 282/306 Ligue 1, 353/380 Premier League and 365/380 La Liga final scores. The newest populated 2026–27 result date in all three datasets at retrieval was 2026-09-20. Missing scores are NOT converted to zero, and displayed coverage reflects only dates before today. Results can be delayed, wrong, corrected or incomplete. Standings omit sanctions and league-specific tie-breakers. Revised dates can leave a saved forecast unmatched.

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

The browser test requires Playwright. It covers mobile/desktop layout, offline data, persistence, archive export/import, malformed import rejection, backtest rendering and offline refresh failures. Model tests check independent probability identities, missing versus nil-nil scores, and future/same-day exclusion. APK compilation/signature checks are not on-device validation.
