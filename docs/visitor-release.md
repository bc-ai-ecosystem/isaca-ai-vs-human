# Visitor edition: review and release

State: implemented and verified locally; public deployment awaits Kris's approval.
Owner: Codex. Scope approved October 14, 2026. Next check: October 15, or on Kris's review reply.

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

## Public release gate

The intended visitor path is `/play.html` on the existing show origin. The public article remains an unpublished editorial draft; publishing it is a separate approval.

Do **not** deploy this entire community checkout over the live show. Its source intentionally starts with unbound polling, whereas the current show origin retains event settings. Production also contains separately hosted audiovisual assets not fully tracked in Git. A replacement deployment could erase those assets or change the stage configuration.

After explicit merge/deploy approval, use the verified current production package and add only these visitor web files:

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

Only then replace the private website/Notion article's rehearsal CTA with “Try the six scenarios” pointing to the verified visitor route, and describe personal choices instead of sample audience votes. Keep an optional rehearsal/source link for people interested in the stage tool. Do not link an unreleased visitor route from the article or publish the article without approval.

## Rollback

Restore the prior production deployment if any release readback fails. Because this feature is additive, removing the eight visitor files and reverting the visitor CTA restores the prior public experience. Do not clear browser show data, remove media masters, reset polling, or roll back unrelated work.
