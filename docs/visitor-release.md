# Visitor edition: review and release

State: shipped October 15, 2026, after Kris approved publication of all three surfaces.
Owner: Codex. Public visitor route: https://isaca-ai-vs-human.vercel.app/play.html.
BC + AI links: [Partners](https://bc-ai.ca/about/partners#isaca-project-title) and [illustrated story](https://bc-ai.ca/news/we-built-a-cyber-crisis-you-can-walk-into).

## What changed

`play.html` is a separate, self-guided entry point for all six incidents. Visitors can watch or read, commit one A/B/C/D choice, compare the current attributed prepared reasoning, and explore the discussion question and tradeoffs. All model confidence remains explicitly self-reported. Scenario 4 carries its October 13 edited-analysis provenance.

Films load on an explicit play gesture, one selected file at a time. Native controls, captions, replay, and a complete text alternative remain available. There is no model API, account, tracking, public leaderboard, or polling connection. Committed progress uses only `aivh-visitor-v1`; invalid data is filtered, blocked storage falls back to the current tab, and resetting requires a confirmation dialog. Personal summaries are printable.

“Behind the show” includes the two supplied documentary images, unchanged:

- Event-night members photo: `media/visitor-event-night.png`, SHA-256 `62e42aa15e646d8141c196a64925aaa6f95d15f856b2de1876c9b6794134fc45`.
- Prep-session collage: `media/visitor-prep-sessions.png`, SHA-256 `512b16ab0db9a802808e4c729ba5c8737c9bc184b6ff1ca6e334d7c846a7414f`.

Names/captions come from Kris. No positional identities, attendance total, event score, audience reaction, or judge quote was inferred. README and visitor credits identify Chris Shachtay as the event-night MC, following Kris's firsthand correction. Existing show configuration is unchanged.

The display face is self-hosted so the typographic treatment is consistent across devices without a third-party font request. `media/visitor-display.ttf` is the unmodified Big Shoulders Display 900 file from Google Fonts (SHA-256 `23ce8d950bbbc0f13fbe3fc11047ec0c2babddd95243de26c85c855ede537c30`). Its [author’s SIL OFL licence](https://github.com/xotypeco/big_shoulders/blob/master/OFL.txt) is preserved at `media/visitor-display-OFL.txt`.

## Local review

```sh
node scripts/serve.mjs
```

Open `http://127.0.0.1:8080/play.html`. This server supports byte ranges for native seeking. Python's basic HTTP server can play films but advertises no seekable range, so it is unsuitable for the seek/end-frame checks.

```sh
npm test
npm run test:visitor -- --url http://127.0.0.1:8080/play.html
npm run test:browser -- --url http://127.0.0.1:8080
python3 scripts/prepare_media.py --check
git diff --check
```

Local results on October 14: 34 Node checks, 29 visitor browser groups, and 33 original showrunner browser groups passed. All six actual films decoded, played with captions, paused/seeked, and stayed on their incident at the end. Failed media still permits a complete read/choose/compare journey. Leaving an incident explicitly pauses and unloads its film before the next screen. Layout was checked at 320, 360, 768, and 1440 px. Keyboard focus, reduced motion, print layout, malformed/blocked storage, catalogue failures, and reset isolation passed. The four responsive groups also passed after the display font was self-hosted. All 21 existing hosted film/caption/poster/provider assets match their local SHA-256 and byte lengths (106,815,790 bytes checked). These are software checks, not new claims about the completed venue event.

There is no separate build or lint command in this static app. Browser execution, source regressions, content drift checks, HTTP range checks, and whitespace validation are the configured verification surfaces.

## Production release record

The visitor source was merged through [PR #1](https://github.com/bc-ai-ecosystem/isaca-ai-vs-human/pull/1), commit `7ace3355415ece9125653c16eafc39ff7b96d4dc`. Deployment `dpl_6hkLAcRBChxk71692PwNYHDisLoa` was checked before promotion and then promoted to the existing show origin. The previous deployment `dpl_BL3QUEFidHcixPXzKNaUYfj8iS8f` is the rollback target.

The complete provider inventory contains 249 pre-existing files (1,286,774,561 bytes). All were preserved unchanged, with eight visitor additions, for 257 deployed files. The first connector file-tree response was truncated; use an uncapped CLI API inventory and inspect truncation metadata for future releases. All 257 provider hashes match the prepared package. Independent anonymous HTTP checks also match all eight additions and six unchanged show/cache/crew entry files by SHA-256 and byte count.

All 29 visitor browser groups pass on the actual public `/play.html` route, including all six real films, seeking/end holds, captions, saved decisions, mobile layouts, reset isolation, and failed-media recovery. A separate browser check confirms the visitor works while the existing show service worker controls the origin. The preserved production show passes 31 of 33 community harness groups: the two remaining assertions require blank polling defaults, while production intentionally retains the original event polling configuration. Do not report that run as 33/33. The original source checkout passed all 33 before packaging.

BC + AI's publication is tracked in [website PR #3240](https://github.com/WalksWithASwagger/bcai-website/pull/3240), under the same explicit approval. Notion remains the private editorial source; the public reading route is on bc-ai.ca.

Do **not** deploy this entire community checkout over the live show. Its source intentionally starts with unbound polling, whereas the current show origin retains event settings. Production also contains separately hosted audiovisual assets not fully tracked in Git. A replacement deployment could erase those assets or change the stage configuration.

For a future visitor update, refresh the verified current production package and change only the visitor web files:

```text
play.html
visitor.css
visitor.js
media/visitor-scenarios.json
media/visitor-event-night.png
media/visitor-prep-sessions.png
media/visitor-display.ttf
media/visitor-display-OFL.txt
```

Preserve the complete existing package, root `index.html`, headers, service workers, film masters, captions, posters, provider badges, and every existing route. Confirm asset bytes against the pinned manifest before packaging. Record the prior deployment identifier and file hashes, then validate the candidate before promoting it. The public source PR and the production deployment are separate operations.

After release, verify anonymous access and exact deployed bytes for all eight added files. Re-run visitor browser checks against the actual public route, including mobile, storage isolation, playback, captions, and media-failure recovery. Verify unchanged root/rehearsal behavior and all six media paths. Inspect cache refresh in a browser that previously used the show. The visitor does not register a new service worker or change the existing scope.

The published article points to the verified visitor route and describes personal decisions. Future updates must keep public links working and retain separate approval for new publication scope.

## Rollback

Restore the prior production deployment if any release readback fails. Because this feature is additive, removing the eight visitor files and reverting the visitor CTA restores the prior public experience. Do not clear browser show data, remove media masters, reset polling, or roll back unrelated work.
