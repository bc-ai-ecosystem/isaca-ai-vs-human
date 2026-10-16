# AI vs. Human

An interactive cyber-awareness showrunner built by **Kris Krüg** for **BC + AI**, in partnership with **ISACA Vancouver**.

Six fictional cyber incidents. Four choices each. Audience decisions, prepared AI responses, and a panel of Cyber Judges who examine the reasoning. The original event took place at the Annex Theatre in Vancouver on October 14, 2026.

- [Try the full rehearsal with films](https://isaca-ai-vs-human.vercel.app/?tour&films=all&revision=oct14-chat)
- [Watch the six scenario films](https://isaca-ai-vs-human.vercel.app/review.html)
- [Official event and contributor listing](https://luma.com/q5ifj88x)
- [BC + AI](https://bc-ai.ca/)

The hosted rehearsal uses separate state, media and sync from the live show. Sample votes are labelled rehearsal data. It does not cast votes into the event.

## Visitor edition

The new `play.html` route is a self-guided edition: watch or read a fictional incident, commit a personal A/B/C/D decision, compare the attributed prepared AI response, and reflect. All six incidents work independently. Films load only when selected. Native playback, captions, text fallbacks, private local progress, deliberate reset, and a printable decision summary are included. Documentary event/prep photographs and contributor credits live under “Behind the show.”

The visitor edition is live: [play the six scenarios](https://isaca-ai-vs-human.vercel.app/play.html). Read the illustrated [build story](https://bc-ai.ca/news/we-built-a-cyber-crisis-you-can-walk-into) or find the project on [BC + AI’s Partners page](https://bc-ai.ca/about/partners#isaca-project-title). Run the preview below for local development. The existing showrunner and rehearsal remain unchanged. The visitor uses only the `aivh-visitor-v1` storage key and makes no polling or model API calls. Progress cannot move between devices; unavailable storage limits it to the current tab.

## Run locally

The application is static HTML, CSS, and JavaScript. Node 24 serves the local preview with byte ranges so native film seeking works. No build, account, AI API key, or paid service is required to inspect the source or walk through the incident briefings.

```sh
node scripts/serve.mjs
```

Open `http://127.0.0.1:8080/play.html` for solo play, or `http://127.0.0.1:8080/?tour&revision=oct14-chat` for a rehearsal. Press **O** for the operator controls. The source snapshot starts with an empty polling code and participant URL. Configure your own event in Setup before attempting live voting.

To include the released scenario films, use Python 3.11+:

```sh
python3 scripts/prepare_media.py
python3 scripts/prepare_media.py --check
```

This downloads the separately hosted media named in `media/manifest.json` and verifies the expected byte length and SHA-256 hash before installation. Then open `http://127.0.0.1:8080/?tour&films=all&revision=oct14-chat`. An initial network connection is required. Optional cinematic alternatives, 720p backups and manual soundboard cues can be fetched with `python3 scripts/prepare_show_media.py`; app transitions remain silent.

## What the tool does

- Separate projector and operator windows on one laptop, browser profile, and origin.
- Six single-choice audience polls; the operator transfers actual counts from Slido or Kahoot.
- Human and AI decision reveals, judge votes, draws, score rewind, and results export.
- Five scored rounds, followed by an unscored collaboration discussion.
- Prepared, attributed AI responses and optional operator overrides. This is not a live model API or a scientific benchmark.
- Scenario-film playback, captions, deliberate pause/restart, final-frame holds, and visible failure recovery.
- Offline app reload and installed media playback after online preparation. Audience polling still needs a network connection.
- Isolated rehearsals and explicit pre-show guards so test votes do not become live results.

**Space / right arrow / Page Down:** GO. **Left arrow / Page Up:** back. **O:** controls. **F:** fullscreen. **B / period:** blackout. Active films hold ordinary GO until they finish; intentional skipping is an operator action.

## Running an event

Use one laptop/profile/origin for both projector and controls, with an extended audience display. A second laptop is an independent backup. There is no cross-laptop sync server.

Set up your own six single-choice polls with fixed A/B/C/D order, hidden participant results, and no correct-answer scoring. Enter your participant URL and code in Setup. The showrunner does not collect votes or call a polling API; the operator opens and closes each poll, reads absolute counts, and enters them by letter.

Export saved results before resetting or changing the show plan. Install films, confirm 6 of 6 readiness, test audio on the projector only, and check both windows offline. Two actual phones, real projector/audio, rear-seat readability, and external opening/closing media switching require a crew rehearsal. Browser checks do not establish venue readiness.

The event-derived source retains its October 14 scenario content, named contributors, and schedule. Adapt those deliberately for another event. This repository does not change the deployed ISACA show or grant access to its polling administration.

## Verification

Node 24 can run the source-level regressions without installing dependencies:

```sh
npm test
```

The visitor catalogue is generated from the show’s existing incident constants, edited stage reasoning, and pinned media manifest. Do not edit it manually. After a deliberate source change, run `node scripts/export_visitor_scenarios.mjs`; `npm test` rejects source drift.

For browser checks:

```sh
npm ci
# Install Google Chrome separately; the browser checks use its Chrome channel.
npm run test:browser -- --url http://127.0.0.1:8080
npm run test:visitor -- --url http://127.0.0.1:8080/play.html
```

Install the films first for full media tests. `test/show-films.mjs` exercises all six films, two-window playback and offline recovery. `test/chat-pacing.mjs` observes the final vendor-chat sequence at normal speed. Run `python3 scripts/prepare_test_media.py` first to fetch and verify the previous cut used by its replacement/restore check. Run tests in disposable browser contexts, never a live event's saved profile.

## Credits and rights

Kris Krüg built the application and developed the scenario-film production with AI-assisted coding and media tools. ISACA Vancouver supplied the event direction and cybersecurity review. Chris Shachtay and Nathan Chan shaped production and show flow; Vipin supported operator delivery and Levi the venue technical route. Chris Shachtay was the event-night MC. Cyber Judges: Penny Longman, Larry Carson, Jeffrey Ten Eyck, and Shashi Gautam. Presenting sponsors: SOCRadar and Gigamon. See the official event listing for roles and affiliations.

The incidents, characters and generated scenario performances are fictional. Model responses and stated confidence are prepared show material, not calibrated probabilities or operational cybersecurity advice.

This repository shares source for inspection. **No general reuse licence has been granted in this snapshot.** Event artwork, audiovisual media, voices and third-party marks have separate rights and permissions. Their presence or availability for viewing does not grant redistribution, voice cloning or endorsement rights.

`source-provenance.json` records the source snapshot and deliberate community adaptations. Private correspondence, credentials and development-repository history are excluded.

The visitor display typeface is self-hosted Big Shoulders Display 900; its SIL OFL licence is included in `media/visitor-display-OFL.txt`.

Visitor release, verification, and rollback: [docs/visitor-release.md](docs/visitor-release.md).
