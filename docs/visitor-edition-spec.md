# AI vs. Human: visitor edition

State: scope approved by Kris on October 14, 2026; implementation verified locally; public release pending approval.
Owner: Codex. Requested by Kris after the October 14, 2026 event.

## Objective and assumptions

Turn the completed stage production into an experience a website visitor can use alone. Keep its dramatic films, dark visual character, and difficult choices. Replace the host-dependent cue sequence with clear personal decisions and reflection.

Approved assumptions:

- A standalone public route, `play.html`, is linked from the BC + AI article. The existing showrunner and rehearsal links keep working.
- The six released films and approved audio are reused. New generation, paid API calls, accounts, analytics, and a backend are unnecessary for this version.
- Visitors choose for themselves. Prepared AI responses are revealed afterward. There is no correct-answer score or invented audience distribution.
- Private progress stays in this browser under a separate visitor key. No event votes, operator settings, uploads, or saved show results are read or changed.
- Public release follows implementation review and verification. The article remains an unpublished draft until Kris approves publication.

## Visitor experience

1. **Arrive.** A restrained cinematic cover: “A cyber incident. Four choices. Your call.” Explain the format in one short paragraph. Offer “Start with the $250K transfer” and “Choose a scenario.” Credit BC + AI, Kris Krüg, and ISACA Vancouver.
2. **Watch or read.** Load only the selected film when requested. Native play, pause, seeking, fullscreen, captions, and replay remain available. Audio begins only after a visitor's gesture. Offer the complete incident briefing at once, including a direct “Read instead” path.
3. **Decide.** Show the incident's exact question and four full choices in fixed A/B/C/D order. No forced timer. Select, review, then explicitly commit the decision. The AI's answer stays hidden until commitment.
4. **Compare.** Put “Your call” beside the attributed prepared AI decision, its reasoning, and the decision's tradeoffs. State clearly that the response was prepared for the show and that stated confidence is not a measured probability. Preserve Scenario 4's edited-analysis provenance; do not imply a fresh model response.
5. **Reflect.** Ask the existing debate question: what evidence would change your mind? The visitor can replay, read, choose another scenario, or return to the index. Changing a committed answer starts that scenario again, rather than silently rewriting history.
6. **Leave with something.** An optional local summary lists decisions and themes explored. Describe agreement or disagreement with the prepared model, not wins, accuracy, or professional competence. Provide a printable summary, replay controls, contributor credits, and a link to the article/source.

All six scenarios work independently. The closing collaboration idea can appear in the visitor summary after a completed scenario. The event's five-round scoring rules are described in an optional “About the live show” section, not applied to solo play.

## Visual direction

Use the production's existing film posters, dark charcoal, off-white text, restrained electric accents, and strong typography. Let the actual incident graphics and performances carry the drama. Use short transition cuts and a quiet selected-choice animation; honor reduced motion. Keep long evidence and choice text comfortably readable on a phone. Avoid flashing, automatic music, decorative simulated hacker terminals, fabricated threat statistics, and extra synthetic effects.

Show the supplied event-night photograph and prep collage in a clearly labelled “From stage to browser” section with existing captions. Documentary imagery remains distinct from fictional scenario footage.

## Project structure and implementation plan

The current app is static HTML/CSS/JavaScript. Node 24 runs verification; Node 24 serves the local preview with byte-range support for native seeking. `index.html` currently owns scenario facts and prepared responses; `media/manifest.json` pins films, captions, and posters.

Use a checked, generated visitor catalogue derived from those existing constants and the media manifest. Do not manually rewrite or fork incident facts. A small Node export/check script generates the catalogue and fails when it drifts from its source. This keeps the first visitor release isolated from showrunner behavior.

Planned files:

- `play.html`, `visitor.css`, `visitor.js`: accessible visitor interface and local state.
- `media/visitor-scenarios.json`: generated six-scenario catalogue, including effective October 14 stage reasoning and provenance.
- `scripts/export_visitor_scenarios.mjs`: export and drift check. Parse only the known content constants; never execute the full application.
- `test/visitor-content.mjs`, `test/visitor-browser.mjs`: content/state and real-browser verification.
- `README.md`: public entry, local commands, accurate event-night MC credit, and boundaries.

Do not change the production origin's root route, live-show configuration, service-worker scope, media masters, polling account, or saved state in this first release. Visitor online playback uses the existing pinned media URLs; an offline download feature is outside this release.

### Ordered work

- [x] **Content contract.** Export the six incidents, full choices, effective prepared responses, provenance, discussion prompts, and pinned media. Validate all A/B/C/D decisions, ids, and asset references; fail on source drift. Files: exporter, generated catalogue, content tests.
- [x] **Core journey.** Build landing/index, watch/read, choice commitment, comparison, and next-scenario navigation. Verify every scenario and both media/text routes. Files: visitor HTML, CSS, JS, browser tests.
- [x] **Persistence and access.** Save and resume only visitor progress; provide a clear local reset. Verify reload, invalid saved data, unavailable storage, keyboard/focus, narrow screens, and reduced motion. Files: visitor JS/CSS and tests.
- [x] **Finish and release review.** Add the local decision summary, credits, documentary context, accurate MC credit, and website article CTA once the visitor route exists. Verify actual six-film playback, captions, loading failures, mobile layout, and no stage regressions. Open a reviewable implementation PR and record release/rollback instructions.

## Code style

Keep plain JavaScript and native elements. Match the repository's existing two-space indentation and double quotes. Escape content when rendering strings; insert visitor-controlled text with `textContent`.

```js
function commitChoice(scenarioId, choice) {
  if (!["A", "B", "C", "D"].includes(choice)) return;
  progress.answers[scenarioId] = choice;
  saveProgress();
  renderComparison(scenarioId);
}
```

Validate persisted input and external catalogue/media responses at their boundaries. Do not build a component framework, an event bus, or a scoring service for this page.

## Commands

Existing baseline:

```sh
npm test
node scripts/serve.mjs
npm run test:browser -- --url http://127.0.0.1:8080
```

Planned visitor checks, implemented with the feature:

```sh
node scripts/export_visitor_scenarios.mjs
node scripts/export_visitor_scenarios.mjs --check
node --test test/visitor-content.mjs
node test/visitor-browser.mjs --url http://127.0.0.1:8080/play.html
git diff --check
```

Run on local verified media and again on the eventual deployed visitor route. Use the installed Playwright/Chrome tooling. No secret-dependent commands are needed.

## Testing and success criteria

- A first-time visitor can start from a phone, watch/read an incident, commit an answer, and see the comparison without a host, second screen, account, event code, or training in keyboard shortcuts.
- All six incidents have exactly the source's facts and choices. The current Scenario 4 script and edited analysis are retained. Prepared-provider attribution remains accurate.
- A direct scenario URL opens correctly; invalid ids return to the scenario index. Completed scenarios can be resumed, replayed, and deliberately reset.
- AI choices are hidden before commitment. Summary counts use only this visitor's committed choices, with no simulated crowd, invented expert verdict, or correct-answer claim.
- The first page makes no film download. Selecting one scenario does not fetch the other five. No autoplay audio, full-show media installation, or polling-provider navigation occurs.
- Every actual film plays with native controls and its caption track; a failed film leaves the full incident readable and the decision path usable.
- Layout works at 360 px and on desktop without horizontal overflow. Keyboard navigation, visible focus, sensible headings/labels, touch targets, and reduced motion are verified.
- Visitor progress uses its own versioned key. A seeded show-state sentinel is unchanged after play, reload, and reset. No polling or operator control is exposed in the visitor journey.
- Existing source tests and full-show browser regressions still pass. Published film bytes remain unchanged.
- Before release: verify the actual deployed HTML/catalogue/CSS/JS, all six media URLs, anonymous access, article CTA, and cache refresh behavior. A deployed route alone is not proof of a usable journey.

## Boundaries and decisions

- **Always:** preserve the stage app and media; keep changes local to the visitor feature; verify before pushing; keep the article private; preserve rights/provenance statements.
- **Ask first:** approve this visitor contract; merge/deploy the public edition and publish the article; add spending, accounts, tracking, data collection, a public crowd leaderboard, or a reuse licence.
- **Never:** alter the original event's poll, invent event results or judge reactions, label prepared model confidence as accuracy, expose secrets, or reuse generated voices for new speech without authorization.

Kris approved this contract on October 14, 2026. The four implementation tasks are complete and the review candidate is available locally. See `visitor-release.md` for verification, the additive release boundary, and rollback. Public deployment and the article CTA/publication remain release gates; no new product decision is required.
