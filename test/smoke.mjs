#!/usr/bin/env node
// End-to-end checks for the showrunner, in real Chrome via Playwright.
//   node apps/isaca-ai-vs-human/test/smoke.mjs                 # the local index.html, over file://
//   node apps/isaca-ai-vs-human/test/smoke.mjs --url https://isaca-ai-vs-human.vercel.app/
// Playwright comes from kk-portal's dev dependencies (pnpm install at the repo root),
// or set PLAYWRIGHT_FROM to any folder whose node_modules has playwright.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appArg = process.argv.indexOf("--app");
const app = appArg > 0 ? path.resolve(process.argv[appArg+1]) : path.join(here,"..");
const argUrl = process.argv.indexOf("--url");
const URL = argUrl > 0 ? process.argv[argUrl + 1] : pathToFileURL(path.join(app, "index.html")).href;
const caseArg = process.argv.indexOf("--case");
const selectedCase = caseArg > 0 ? process.argv[caseArg+1] : null;

function loadPlaywright() {
  const bases = [process.env.PLAYWRIGHT_FROM, here, path.join(here, "../../kk-portal"), process.cwd()].filter(Boolean);
  for (const base of bases) for (const pkg of ["playwright", "@playwright/test"]) {
    try { return createRequire(path.join(base, "x.js"))(pkg); } catch {}
  }
  throw new Error("Playwright not found. Run pnpm install at the kk-kb root, or set PLAYWRIGHT_FROM.");
}
const { chromium } = loadPlaywright();

/* ---------- page helpers (run inside the page) ---------- */
const H = {
  label: () => document.querySelector(".op-pos b").textContent,
  jump: part => {
    const b = [...document.querySelectorAll("[data-act=jump]")].find(x => x.textContent.includes(part));
    if (!b) throw new Error("no cue matching " + part);
    b.click();
  },
  act: (sel) => { const b = document.querySelector(sel); if (!b) throw new Error("missing " + sel); b.click(); },
};
const jump = (p, part) => p.evaluate(`(${H.jump})(${JSON.stringify(part)})`);
const act = (p, sel) => p.evaluate(`(${H.act})(${JSON.stringify(sel)})`);
const acknowledgeFallback = p => p.evaluate(() => document.querySelector('[data-act="ackpreflight"]')?.click());
const workspace = (p,view) => act(p,`[data-act="opview"][data-view="${view}"]`);
async function openSetup(p) {
  await workspace(p,"setup");
  await p.locator("#d-set").evaluate(el=>el.open=true);
}
const label = p => p.evaluate(H.label);
const settle = p => p.evaluate(() => { document.getAnimations().forEach(a => { try { a.finish(); } catch {} }); });
async function setVotes(p, votes) {
  await p.evaluate(v => {
    for (const [k, n] of Object.entries(v)) {
      const i = document.querySelector(`[data-vote="${k}"]`);
      i.value = String(n);
      i.dispatchEvent(new Event("input", { bubbles: true }));
      i.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, votes);
}
async function setJudges(p, list) {
  for (const [i, v] of list.entries()) await act(p, `[data-act=jv][data-i="${i}"][data-v="${v}"]`);
}
const vbar = p => p.evaluate(() => document.querySelector(".vbar").textContent);
async function automaticDraw(p,answer) {
  eq(await p.locator(".auto-draw h2").textContent(),"Same call. Round drawn.","automatic draw verdict");
  ok((await p.locator(".auto-draw p").textContent()).includes(`both chose ${answer}`),"shared decision is explicit");
  ok((await p.locator(".auto-draw p").textContent()).includes("judges do not vote"),"no vote is explained");
  eq(await p.locator("#scene .jcard").count(),0,"automatic draw creates no judge vote cards");
  eq(await p.locator('[data-score="draw"]').textContent(),"1","the shared decision records one draw");
}
const bugScore = p => p.evaluate(() => ["H","AI"].map(k => document.querySelector(`[data-score="${k}"]`).textContent).join("-"));
const legacyScore = p => p.evaluate(() => [...document.querySelectorAll("#bug .bug-n")].map(e => e.textContent).join("-"));
async function legacyPlan(p,key="aivh-show-v1") {
  await p.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key) || "null") || {v:1};
    state.config = {...state.config,showPlan:"oct14-feedback",showTiming:"oct11-85-20",pollingProvider:"kahoot",pollingJoinURL:"",pin:"1234567",useChrisAI:true};
    localStorage.setItem(key,JSON.stringify(state));
  },key);
  await p.reload(); await p.waitForSelector(".op-pos b");
}
const cueIndex = p => p.evaluate(() => +document.querySelector(".op-pos .mono").textContent.match(/Cue (\d+)/)[1]);
const reveal = p => act(p, "[data-act=reveal]");
const pause = p => p.waitForTimeout(350); // keyboard GO ignores repeats inside 300 ms
// A short webm with a picture and a tone, made in the page so the repo needs no media fixture.
async function loadTestVideo(p, slot, seconds = 3) {
  await openSetup(p);
  await p.mouse.click(10,10);
  await p.evaluate(async ({ slot, seconds }) => {
    const c = Object.assign(document.createElement("canvas"), { width: 320, height: 180 });
    const g = c.getContext("2d"), ac = new AudioContext(), osc = ac.createOscillator(), dst = ac.createMediaStreamDestination();
    osc.connect(dst); osc.start();
    const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dst.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" }), parts = [];
    rec.ondataavailable = e => parts.push(e.data);
    const stopped = new Promise(resolve=>rec.onstop=resolve);
    let f = 0; const draw = setInterval(() => { g.fillStyle = `hsl(${f++ * 9},80%,50%)`; g.fillRect(0, 0, 320, 180); }, 33);
    rec.start(); await new Promise(r => setTimeout(r, seconds * 1000)); rec.stop();
    await stopped; clearInterval(draw); osc.stop();
    stream.getTracks().forEach(track=>track.stop());await ac.close();
    const file = new File(parts, `${slot}-test.webm`, { type: "video/webm" });
    if(!file.size)throw new Error("Recorded fixture has no video bytes");
    document.querySelector("#d-set").open = true;
    const input = document.querySelector(`input[data-media="${slot}"]`);
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { slot, seconds });
  await p.waitForFunction(slot => JSON.parse(localStorage.getItem(location.search.includes("tour") ? "aivh-tour-v1" : "aivh-show-v1"))?.config.media[slot], slot);
  ok(await p.evaluate(slot=>{const m=JSON.parse(localStorage.getItem(location.search.includes("tour")?"aivh-tour-v1":"aivh-show-v1")).config.media[slot];return m.name===`${slot}-test.webm`&&m.size>0&&Number.isFinite(m.duration)&&m.duration>0&&m.width===320&&m.height===180;},slot),"recorded movie is accepted with finite decoded duration and picture");
  await workspace(p,"live");
}

/* ---------- harness ---------- */
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" }).catch(() => chromium.launch());
const results = [];
async function test(name, fn) {
  if(selectedCase&&!name.includes(selectedCase))return;
  console.log(`RUN   ${name}`);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  const open = async (hash = "") => {
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(e.message));
    await p.goto(URL + hash, {waitUntil:"domcontentloaded"});
    await p.waitForSelector(".op-pos b");
    await p.evaluate(() => document.fonts.ready);
    return p;
  };
  try {
    await fn(open);
    if (errors.length) throw new Error("page errors: " + errors.join(" | "));
    results.push([true, name]);
  } catch (e) {
    results.push([false, name, e.message.split("\n")[0]]);
  }
  await ctx.close();
  const result=results.at(-1);console.log(`${result[0]?"PASS":"FAIL"}  ${name}${result[2]?` · ${result[2]}`:""}`);
}
function eq(a, b, what) { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(v, what) { if (!v) throw new Error(what); }

/* ---------- tests ---------- */
await test("every cue renders inside the 1920x1080 frame", async open => {
  const p = await open();
  await act(p, "[data-act=demo]");
  const total = await p.evaluate(() => +document.querySelector(".op-pos .mono").textContent.match(/of (\d+)/)[1]);
  eq(total, 54, "v3 cue count without films");
  for (let i = 0; i < total; i++) {
    await p.evaluate(i => document.querySelector(`[data-act=jump][data-i="${i}"]`).click(), i);
    await settle(p);
    eq(await p.locator("#bug").isVisible(),false,"no persistent stage scoreboard");
    eq(await p.locator("#tour").isVisible(),false,"no projector navigation footer");
    const out = await p.evaluate(() => {
      const st = document.querySelector("#stage").getBoundingClientRect(), k = st.width / 1920;
      let b = 0, r = 0;
      document.querySelectorAll("#scene *").forEach(el => {
        const x = el.getBoundingClientRect();
        if (x.width && x.height) { b = Math.max(b, (x.bottom - st.top) / k); r = Math.max(r, (x.right - st.left) / k); }
      });
      return { b, r };
    });
    ok(out.b <= 1030 && out.r <= 1880, `cue ${i} (${await label(p)}) spills out: bottom ${Math.round(out.b)}, right ${Math.round(out.r)}`);
  }
});

await test("scoring: 3-1 wins, 2-2 draws, 4-0 wins, same call draws, ties go to the host", async open => {
  const p = await open();
  await jump(p, "R2 · Human decision"); await setVotes(p, { A: 5, B: 40, C: 20, D: 10 });
  await jump(p, "R2 · Judges");
  await setJudges(p, ["H", "H", "H", "AI"]); eq(await vbar(p), "All four votes are locked in", "locked");
  await reveal(p); eq(await vbar(p), "Humans take the round · 3–1", "3-1");
  await setJudges(p, ["H", "H", "AI", "AI"]); eq(await vbar(p), "Split decision · round drawn", "2-2");
  await setJudges(p, ["AI", "AI", "AI", "AI"]); eq(await vbar(p), "AI takes the round · 4–0", "4-0");
  await jump(p, "R1 · Human decision"); await setVotes(p, { A: 1, B: 30, C: 2, D: 3 });
  await jump(p, "R1 · Judges"); await automaticDraw(p,"B");
  await jump(p, "R3 · Human decision"); await setVotes(p, { A: 10, B: 10, C: 3, D: 1 });
  ok((await p.textContent(".verdict")).includes("tie at the top"), "tie message");
  await act(p, `[data-act=ov][data-k="B"]`);
  eq(await p.textContent(".verdict .big"), "B", "host tie-break");
});

await test("saved October feedback plans retain round-six Human/AI judging and draws", async open => {
  const p = await open();
  await legacyPlan(p);
  await jump(p, "R6 · Human decision"); await setVotes(p, { A: 10, B: 30, C: 5, D: 2 });
  await jump(p, "R6 · Judges");
  eq(await p.locator(".side").count(), 2, "two sides");
  eq(await p.locator('[data-act=jv][data-v="HAI"]').count(), 0, "no combined judge vote");
  await setJudges(p, ["H", "H", "H", "AI"]); await reveal(p);
  eq(await vbar(p), "Humans take the round · 3–1", "human verdict");
  await setJudges(p, ["H", "H", "AI", "AI"]);
  eq(await vbar(p), "Split decision · round drawn", "round-six split");
  await jump(p, "R6 · Human decision"); await setVotes(p, { A: 5, B: 12, C: 40, D: 2 });
  await jump(p, "R6 · Judges");
  await automaticDraw(p,"C");
});

await test("operator score counts a round only after its judging cue is reached", async open => {
  const p = await open();
  await act(p, "[data-act=demo]");
  await jump(p, "R1 · Human decision");
  eq(await p.locator('[data-score="draw"]').textContent(),"0","draw not counted before AI reveal");
  await jump(p, "R1 · Judges");
  eq(await p.locator('[data-score="draw"]').textContent(),"1","draw counted on judging cue");
});

await test("control window and projector window stay in sync", async open => {
  const stage = await open(), control = await open("#control");
  await acknowledgeFallback(control);
  await act(control, "[data-act=go]");
  await stage.waitForFunction(() => document.querySelector(".op-pos b").textContent === "External opener · hold black");
  await act(control, "[data-act=black]");
  await stage.waitForFunction(() => document.querySelector("#black").classList.contains("on"));
});

await test("video: plays with sound on the projector, muted in control, pause/restart, resumes after refresh", async open => {
  const stage = await open(), control = await open("#control");
  await loadTestVideo(control, "vig1", 3);
  await jump(control, "R1 · Video vignette");
  await stage.waitForFunction(() => { const v = document.querySelector("#media video"); return v && v.currentTime > 0.3; });
  eq(await stage.evaluate(() => document.querySelector("#media video").muted), false, "projector muted");
  eq(await control.evaluate(() => document.querySelector("#media video").muted), true, "control muted");
  await act(control, "[data-act=vpause]");
  await stage.waitForFunction(() => document.querySelector("#media video").paused);
  await act(control, "[data-act=vrestart]");
  await stage.waitForFunction(() => { const v = document.querySelector("#media video"); return !v.paused && v.currentTime < 1; });
  await stage.waitForTimeout(800);
  const before = await stage.locator("#media video").evaluate(v=>v.currentTime);
  await stage.reload(); await stage.waitForFunction(()=>document.querySelector("#media video")?.readyState>=2);
  const restored=await stage.locator("#media video").evaluate(v=>v.currentTime);
  ok(restored>=before-.15,`refresh rewound the projector from ${before.toFixed(3)}s to ${restored.toFixed(3)}s`);
  if(await stage.locator("#unmute").isVisible())await stage.locator("#unmute").click();
  await stage.waitForFunction(t=>{const v=document.querySelector("#media video");return !v.paused&&v.currentTime>t+.2;},restored);
});

await test("AI reply paste: parses markdown, rejects junk, resets", async open => {
  const p = await open();
  await jump(p, "R2 · AI decision");
  await p.evaluate(() => { document.querySelector("#d-ai").open = true; });
  await p.fill("#ai-paste", "**DECISION:** B\n**CONFIDENCE:** 81%\n**REASONING:** Backups are intact.\n**BIGGEST RISK IF WRONG:** Restore runs long.");
  await act(p, "[data-act=aiuse]");
  eq(await p.textContent(".acard .big"), "B", "pasted decision");
  await p.fill("#ai-paste", "I would probably go with C.");
  await act(p, "[data-act=aiuse]");
  ok((await p.textContent("#d-ai")).includes("Couldn't find"), "junk rejected");
  await act(p, "[data-act=aireset]");
  eq(await p.textContent(".acard .big"), "C", "reset to drafted");
});

await test("only scenarios 1 to 6: five scored rounds and six audience polls", async open => {
  const p = await open();
  const rounds = await p.evaluate(() => [...document.querySelectorAll(".cue")].map(b => b.textContent).filter(t => / · Judges$/.test(t.replace(/^\d+/, ""))).length);
  eq(rounds, 5, "judged rounds");
  const sheet = await p.evaluate(() => document.querySelector("#copy-k").value);
  ok(!/Backup scenario|Departing Developer|Company.s Secrets/.test(sheet), "backup scenario in the voting sheet");
  eq(sheet.split("\n").length, 7, "header + six single polls");
  eq(await p.evaluate(() => document.querySelector("[data-act=bonus]")), null, "bonus button");
});

await test("v3 finale follows round-six AI, collaboration, CTA, external closing and Q&A with manual holds", async open => {
  const p = await open();
  await jump(p, "How a round works");
  ok(!(await p.textContent("[data-sclock]")).includes("of 85:00"), "cue selection does not start the show");
  await jump(p, "Pre-show: take your seats");
  await acknowledgeFallback(p);
  await act(p, "[data-act=go]");
  eq(await label(p), "External opener · hold black", "opening GO");
  ok((await p.textContent("[data-sclock]")).includes("of 85:00"), "85-minute show clock");
  eq(await p.textContent("#scene"), "", "opening blank");
  ok(await p.locator("#stage").evaluate(el => el.classList.contains("external-playback")), "black hold");
  await p.waitForTimeout(500); eq(await label(p), "External opener · hold black", "no auto advance");
  await pause(p); await act(p, "[data-act=go]"); eq(await label(p), "How a round works", "opening returns to rules");
  await jump(p, "R6 · AI decision");
  const ending = ["interruption","collaboration","collaborationDiscussion","thanks","externalClosing","qa"];
  for (const type of ending.slice(0,4)) {
    await pause(p); await act(p,"[data-act=go]");
    eq(await p.locator("#stage").getAttribute("data-scene"),type,`manual ${type} cue`);
    const before=await cueIndex(p); await p.waitForTimeout(type === "collaboration" ? 3300 : 500);
    eq(await cueIndex(p),before,`${type} holds for GO`);
  }
  ok(!(await p.textContent("#scene")).includes("Human + AI"), "CTA contains only festival invitation");
  await pause(p); await act(p,"[data-act=go]");
  eq(await label(p), "External outro and credits · hold black", "closing handoff");
  eq(await p.textContent("#scene"), "", "closing blank");
  await p.waitForTimeout(500); eq(await label(p), "External outro and credits · hold black", "closing waits");
  await pause(p); await act(p, "[data-act=go]"); eq(await label(p), "Audience Q&A", "Q&A follows complete external closing");
});

await test("five scored debate holds show only the centered title; round six goes directly to the finale", async open => {
  const p = await open();
  const labels = await p.locator(".cue").allTextContents();
  eq(labels.filter(x => / · Poll$/.test(x)).length, 6, "six polls");
  ok(!labels.some(x => /Pivot|Poll 2|Final score/.test(x)), "removed competition/revote cues stay absent");
  const types=await p.locator(".cue").evaluateAll(els=>els.map(el=>({type:el.dataset.cueType,sid:el.dataset.cueSid})));
  const finalAI=types.findIndex(c=>c.type==="ai"&&c.sid==="6");
  ok(!types.slice(0,finalAI+1).some(c=>c.type.startsWith("collaboration")),"no collaboration before final AI reveal");
  eq(await p.locator('[data-cue-type="scorecard"]').count(),5,"five scorecards");
  eq(await p.locator('[data-cue-type="judges"][data-cue-sid="6"], [data-cue-type="debate"][data-cue-sid="6"]').count(),0,"no round-six judge dependency");
  for (let round = 1; round <= 5; round++) {
    await jump(p, `R${round} · Judge debate`);
    eq((await p.textContent("#scene")).trim(), "Cyber Judges Debate", "debate stage");
    eq(await p.locator("#bug").isVisible(), false, "no debate scoreboard");
    ok((await p.textContent("#op")).includes("Decision tension"), "operator notes retained");
    const centered = await p.locator(".debate-hold h1").evaluate(el => {
      const a = el.getBoundingClientRect(), b = document.querySelector("#scene").getBoundingClientRect();
      return Math.abs((a.left+a.right-b.left-b.right)/2) < 2 && Math.abs((a.top+a.bottom-b.top-b.bottom)/2) < 2;
    });
    ok(centered, "debate title centered");
  }
});

await test("keys: clicker keys, blackout, Shift override, F5 ignored, held keys don't skip", async open => {
  const p = await open();
  await acknowledgeFallback(p);
  await p.click("#stage");
  await p.keyboard.press("Space"); eq(await label(p), "External opener · hold black", "space");
  await pause(p); await p.keyboard.press("ArrowLeft"); eq(await label(p), "Pre-show: take your seats", "left");
  await pause(p); await p.keyboard.press("PageDown"); eq(await label(p), "External opener · hold black", "page down");
  await pause(p); await p.keyboard.press("PageUp"); eq(await label(p), "Pre-show: take your seats", "page up");
  await pause(p); await p.keyboard.press("F5"); eq(await label(p), "Pre-show: take your seats", "F5 ignored");
  await p.keyboard.press("Space"); await p.keyboard.press("Space"); eq(await label(p), "External opener · hold black", "double send moves once");
  await p.keyboard.press("Period"); ok(await p.evaluate(() => document.querySelector("#black").classList.contains("on")), "period blackout");
  await p.keyboard.press("b"); ok(!(await p.evaluate(() => document.querySelector("#black").classList.contains("on"))), "b lifts blackout");
  await jump(p, "R2 · Human decision"); await setVotes(p, { A: 10, B: 10, C: 2, D: 0 });
  await p.click("#stage"); await p.keyboard.press("Shift+B");
  eq(await p.textContent(".verdict .big"), "B", "Shift+B breaks the tie");
  await jump(p, "R2 · Judges"); await p.click("#stage"); await p.keyboard.press("1");
  ok(await p.evaluate(() => document.querySelector(".jcard .jv").classList.contains("lock")), "judge 1 locked in by key");
  await pause(p); await p.keyboard.press("PageDown");
  ok((await p.textContent(".guard")).includes("Only 1 of 4"), "GO holds on a partial vote");
  // A focused control keeps its native activation; clicker PageDown still sends GO
  await p.evaluate(() => document.querySelector("[data-act=black]").focus());
  await pause(p); await p.keyboard.press("Space");
  eq(await label(p), "R2 · Judges", "focused button keeps cue");
  ok(await p.evaluate(() => document.querySelector("#black").classList.contains("on")), "focused blackout activated");
  await pause(p); await p.keyboard.press("PageDown");
  eq(await label(p), "R2 · Judge debate", "clicker second GO moves on");
});

await test("reveal: GO flips the four votes, the scoreboard waits for the verdict, next GO moves on", async open => {
  const p = await open();
  await jump(p, "R2 · Human decision"); await setVotes(p, { A: 5, B: 40, C: 20, D: 10 });
  await jump(p, "R2 · Judges"); await setJudges(p, ["H", "H", "H", "AI"]);
  eq(await p.locator(".jv.lock").count(), 4, "four face down");
  eq(await bugScore(p), "0-0", "score before reveal");
  await act(p, "[data-act=go]");
  eq(await label(p), "R2 · Judges", "first GO reveals in place");
  eq(await p.locator(".jv.lock").count(), 0, "all flipped");
  eq(await bugScore(p), "0-0", "scoreboard held during the flip");
  await p.waitForFunction(() => ["H","AI"].map(k=>document.querySelector(`[data-score="${k}"]`).textContent).join("-") === "1-0", null, { timeout: 5000 });
  await act(p, "[data-act=go]"); eq(await label(p), "R2 · Judge debate", "second GO moves on");
});

await test("a round skipped past in Run of show still counts its votes", async open => {
  const p = await open();
  await jump(p, "R2 · Human decision"); await setVotes(p, { A: 5, B: 40, C: 20, D: 10 });
  await jump(p, "R2 · Judges"); await setJudges(p, ["AI", "AI", "AI", "H"]);
  await jump(p, "R3 · Briefing");
  eq(await bugScore(p), "0-1", "AI point counted");
});

await test("GO hold set in the projector window shows in the control window", async open => {
  const stage = await open(), control = await open("#control");
  await jump(control, "R3 · Human decision");
  await stage.waitForFunction(() => document.querySelector(".op-pos b").textContent === "R3 · Human decision");
  await stage.click("#stage"); await stage.keyboard.press("PageDown");
  await control.waitForSelector(".guard");
  ok((await control.textContent(".guard")).includes("No room decision yet"), "hold message");
  await setVotes(control, { A: 1, B: 20, C: 3, D: 4 });
  eq(await control.locator(".guard").count(), 0, "hold clears once the vote is in");
});

await test("reset for doors: needs two separate taps, wipes votes, keeps names; rehearsal fill locks during a real show", async open => {
  const p = await open();
  await openSetup(p);
  await p.fill("#set-j1", "Test Judge"); await p.press("#set-j1", "Tab");
  await act(p, "[data-act=demo]"); await jump(p, "R4 · Judges");
  await openSetup(p);
  await p.dblclick("#resetBtn");
  eq(await label(p), "R4 · Judges", "double-click does not reset");
  await p.waitForTimeout(700); await p.click("#resetBtn");
  eq(await label(p), "Pre-show: take your seats", "second tap resets");
  ok((await p.textContent("#d-set")).includes("Reset for doors: no votes"), "checklist");
  eq(await p.inputValue("#set-j1"), "Test Judge", "judge name kept");
  await acknowledgeFallback(p);
  await act(p, "[data-act=go]");
  await jump(p, "R1 · Human decision"); await setVotes(p, { A: 1, B: 2, C: 3, D: 9 });
  ok(await p.evaluate(() => document.querySelector("[data-act=demo]").disabled), "rehearsal fill off during a real show");
});

await test("pre-show: Slido code and QR, with projector controls hidden when the booth window is open", async open => {
  const stage = await open(), control = await open("#control");
  await openSetup(control);
  eq(await control.inputValue("#set-pin"),"","unbound community event code");
  eq(await control.inputValue("#set-poll-url"),"","unbound community participant link");
  await stage.waitForSelector(".preshow .qr svg", { timeout: 15000 });
  ok((await stage.textContent(".preshow")).includes("Joining code coming up"), "community copy prompts the operator to set its own code");
  ok((await stage.textContent(".preshow")).includes("slido.com"),"Slido joining instruction");
  await stage.waitForFunction(() => document.body.classList.contains("has-control"), null, { timeout: 6000 });
  eq(await stage.evaluate(() => getComputedStyle(document.querySelector("#opBtn")).display), "none", "projector control button hidden");
  await control.waitForFunction(() => document.querySelector("[data-proj]").textContent.includes("Projector"), null, { timeout: 6000 });
});

await test("v3 tour isolates sample votes; projector footer is hidden and operator GO reveals judges", async open => {
  const t = await open("?tour");
  eq(await t.isVisible("#tour"),false,"projector footer hidden");
  await jump(t, "R3 · Judges");
  await act(t,"[data-act=go]");
  eq(await t.locator(".jv.lock").count(), 0, "GO reveals the votes");
  const show = await open();
  eq(await label(show), "Pre-show: take your seats", "show state untouched");
  eq(await show.evaluate(() => document.querySelector("#bug").textContent.includes("Rehearsal")), false, "no rehearsal data leaked");
});

await test("after the show: results table for the recap", async open => {
  const p = await open();
  await act(p, "[data-act=demo]");
  const txt = await p.evaluate(() => document.querySelector("#copy-r").value);
  ok(txt.includes("| 2 | Code Red | B (35%) | Claude · C (75%) | AI AI H AI | AI takes the round · 3–1 |"), "round 2 row: " + txt.split("\n")[4]);
  ok(/Final: Humans \d, AI \d/.test(txt), "final line");
});

await test("GO button: a double-click moves one screen; a click right after typing a count still lands", async open => {
  const p = await open();
  await p.evaluate(() => document.body.classList.add("op-open"));
  await jump(p, "External opener · hold black");
  await p.dblclick("[data-act=go]");
  eq(await label(p), "How a round works", "double-click moved once");
  await jump(p, "R2 · Poll");
  await p.fill('[data-vote="B"]', "40");
  await pause(p); await p.click("[data-act=go]");
  eq(await label(p), "R2 · Human decision", "click after typing advanced");
  eq(await p.textContent(".verdict .big"), "B", "typed count saved");
});

await test("score rewind preserves results; round six exports unscored without contributing a point or draw", async open => {
  const p = await open();
  await jump(p,"R5 · Human decision");await setVotes(p,{A:30,B:2,C:1,D:2});
  await jump(p,"R5 · Judges");await setJudges(p,["AI","AI","AI","H"]);
  await act(p, "[data-act=go]");
  await jump(p, "R6 · Human decision"); await setVotes(p, { A: 1, B: 2, C: 30, D: 2 });
  await jump(p, "External outro and credits");
  const output=await p.inputValue("#copy-r");
  ok(output.includes("Final: Humans 0, AI 1"),"only scored round five contributes");
  ok(/\| 6 \|.*C \(86%\).*\|\s*\| Unscored closing discussion \|/i.test(output),"round six has response, empty judge cell and unscored status");
  await jump(p, "R5 · AI decision"); eq(await bugScore(p), "0-0", "Back rewinds score");
  ok((await p.inputValue("#copy-r")).includes("Final: Humans 0, AI 1"), "rewind preserves saved votes");
});

await test("tour media stays out of the show's media store", async open => {
  const t = await open("?tour");
  await loadTestVideo(t, "opener", 1);
  const show = await open();
  await show.waitForTimeout(500);
  ok(!(await show.evaluate(() => [...document.querySelectorAll(".cue")].some(b => b.textContent.includes("Opener video")))), "show gained the tour's opener");
  ok(await show.evaluate(() => new Promise(res => { const r = indexedDB.open("aivh-media", 1); r.onupgradeneeded = () => r.result.createObjectStore("files"); r.onsuccess = () => { const q = r.result.transaction("files").objectStore("files").count("opener"); q.onsuccess = () => res(q.result === 0); }; })), "show store has no opener");
});

await test("October 6 tours start the new flow and download the revised film without changing prior tours or live show", async open => {
  const p = await open(), context = p.context();
  const catalog = JSON.parse(readFileSync(path.join(app,"media","manifest.json"),"utf8"));
  const origin = "https://isaca-revision.test", bytes = readFileSync(path.join(app,"media",catalog.vig4.file));
  const revised = {file:"revised-vig1.mp4",bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),duration_seconds:catalog.vig4.duration_seconds};
  let downloads=0;
  await context.route(origin+"/**",route=>{
    const url=new globalThis.URL(route.request().url());
    if (url.pathname==="/") return route.fulfill({contentType:"text/html",body:readFileSync(path.join(app,"index.html"),"utf8")});
    if (url.pathname==="/showpiece.css") return route.fulfill({contentType:"text/css",body:readFileSync(path.join(app,"showpiece.css"),"utf8")});
    if (url.pathname==="/media/manifest.json") return route.fulfill({contentType:"application/json",body:JSON.stringify({vig1:revised})});
    if (url.pathname==="/media/"+revised.file) { downloads++; return route.fulfill({contentType:"video/mp4",body:bytes}); }
    return route.fulfill({status:404,body:"unavailable"});
  });
  await p.goto(origin,{waitUntil:"domcontentloaded"});
  const priorKeys=["aivh-show-v1","aivh-tour-v1","aivh-film1-tour-v1"];
  await p.evaluate(async keys=>{
    for (const key of keys) {
      localStorage.setItem(key,JSON.stringify({v:1,cue:0,clock:{show:12345,round:12345},rounds:{1:{votes:{A:7,B:2,C:1,D:0}}},config:{lineup:[1,2,3,4,5,6],pivotAfter:5,combined:[6],media:{vig1:{name:"old-cut.mp4",v:1,size:20}}}}));
    }
    for (const name of ["aivh-media","aivh-tour-media","aivh-film1-tour-media"]) await new Promise((resolve,reject)=>{
      const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore("files");
      request.onsuccess=()=>{const db=request.result,tx=db.transaction("files","readwrite");tx.objectStore("files").put(new File(["prior media sentinel"],"old-cut.mp4"),"vig1");tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);
    });
  },priorKeys);
  const prior=await p.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),priorKeys);
  const observer=await context.newPage();await observer.goto(origin,{waitUntil:"domcontentloaded"});
  await observer.evaluate(()=>{
    window.priorStateMessages=0;
    window.priorChannels=["aivh-show","aivh-tour","aivh-film1-tour"].map(name=>{
      const channel=new BroadcastChannel(name);channel.onmessage=event=>{if(event.data?.kind==="state") window.priorStateMessages++;};return channel;
    });
  });
  await p.goto(origin+"/?tour&revision=oct6",{waitUntil:"domcontentloaded"});
  await p.waitForSelector(".op-pos");await jump(p,"How a round works");
  eq(await p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-tour-v1-oct6")).config.showPlan),"oct14-v3","fresh general tour plan");
  ok(!(await p.locator(".cue").allTextContents()).some(label=>label.includes("Poll 2")),"general tour uses six single polls");
  await p.goto(origin+"/?tour&film=1&revision=oct6",{waitUntil:"domcontentloaded"});
  await p.waitForFunction(name=>JSON.parse(localStorage.getItem("aivh-film1-tour-v1-oct6") || "null")?.config.media.vig1?.name===name,revised.file);
  eq(downloads,1,"revised film downloaded despite old tour media");
  eq(await p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-film1-tour-v1-oct6")).config.showPlan),"oct14-v3","fresh film tour plan");
  const control=await context.newPage();await control.goto(origin+"/?tour&film=1&revision=oct6#control",{waitUntil:"domcontentloaded"});
  await control.waitForSelector(".op-pos");await act(control,'[data-act="black"]');
  await p.waitForFunction(()=>document.querySelector("#black").classList.contains("on"));
  eq(JSON.stringify(await p.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),priorKeys)),JSON.stringify(prior),"prior saved states unchanged");
  const blob=async name=>p.evaluate(name=>new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,1);request.onsuccess=()=>{const db=request.result,tx=db.transaction("files","readonly"),get=tx.objectStore("files").get("vig1");get.onsuccess=async()=>{const file=get.result,digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer()),result={name:file.name,size:file.size,sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("")};db.close();resolve(result);};get.onerror=()=>reject(get.error);};request.onerror=()=>reject(request.error);
  }),name);
  for (const name of ["aivh-media","aivh-tour-media","aivh-film1-tour-media"]) {
    const file=await blob(name);eq(file.name,"old-cut.mp4","prior media name");eq(file.sha256,createHash("sha256").update("prior media sentinel").digest("hex"),"prior media bytes");
  }
  const revisedBlob=await blob("aivh-film1-tour-media-oct6");
  eq(revisedBlob.name,revised.file,"revised media database");eq(revisedBlob.sha256,revised.sha256,"revised media bytes");
  eq(await observer.evaluate(()=>window.priorStateMessages),0,"revised tour cannot send state to prior channels");
  await control.close();await observer.close();
});

await test("keyboard disclosures and live updates preserve cue, expansion and focus", async open => {
  const p = await open("?tour");
  await p.setViewportSize({ width:390, height:844 });
  await jump(p, "R1 · Poll");
  const summary = p.locator(".answer-detail summary").first();
  await summary.focus(); await p.keyboard.press("Space");
  eq(await label(p), "R1 · Poll", "Space does not GO from a summary");
  ok(await p.locator(".answer-detail").first().evaluate(e => e.open), "Space opens full answer");
  await p.evaluate(() => { const f = document.querySelector('[data-vote="A"]'); f.value = "12"; f.dispatchEvent(new Event("change", { bubbles:true })); });
  ok(await p.locator(".answer-detail").first().evaluate(e => e.open), "update preserves expansion");
  ok(await summary.evaluate(e => e === document.activeElement), "update preserves summary focus");
  await p.keyboard.press("Enter");
  eq(await label(p), "R1 · Poll", "Enter does not GO from a summary");
  ok(!(await p.locator(".answer-detail").first().evaluate(e => e.open)), "Enter closes full answer");
  await p.evaluate(()=>document.body.classList.add("op-open"));
  const guide = p.locator("#d-host summary");
  await guide.focus(); await p.keyboard.press("Space");
  ok(await p.locator("#d-host").evaluate(e=>e.open),"Space opens operator host notes");
  ok(await guide.evaluate(e => e === document.activeElement), "operator notes retain focus");
  await p.keyboard.press("Enter");
  eq(await p.locator("#d-host").evaluate(e=>e.open),false,"Enter closes operator notes");
  eq(await label(p), "R1 · Poll", "operator notes do not advance");
});

await test("keyboard control activation retains focus through forward and reverse GO", async open => {
  const p = await open("#control");
  const black = p.locator('[data-act="black"]');
  await black.focus(); await p.keyboard.press("Space");
  eq(await label(p), "Pre-show: take your seats", "blackout keeps cue");
  ok(await p.evaluate(() => document.querySelector("#black").classList.contains("on")), "Space blackouts");
  ok(await black.evaluate(e => e === document.activeElement), "blackout focus survives render");
  await p.keyboard.press("Enter");
  ok(!(await p.evaluate(() => document.querySelector("#black").classList.contains("on"))), "Enter lifts blackout");
  await acknowledgeFallback(p);
  const go = p.locator('[data-act="go"]'); await go.focus(); await p.keyboard.press("Space");
  eq(await label(p), "External opener · hold black", "focused GO advances once");
  ok(await go.evaluate(e => e === document.activeElement), "GO retains focus");
  await pause(p); await p.keyboard.press("Enter");
  eq(await label(p), "How a round works", "Enter repeats focused GO");
  await pause(p); await p.locator('[data-act="back"]').focus(); await p.keyboard.press("Space");
  eq(await label(p), "External opener · hold black", "focused Back reverses");
  await pause(p); await go.focus(); await p.keyboard.down("Enter");
  await pause(p); await p.keyboard.down("Enter"); await p.keyboard.up("Enter");
  eq(await label(p), "How a round works", "held focused Enter does not skip a second cue");
});

await test("dedicated controls fit narrow windows with long cues and fallback fonts", async open => {
  const p = await open("?tour#control");
  eq(await p.locator("#op").evaluate(el => getComputedStyle(el).transitionDuration), "0s", "dedicated controls appear without an off-screen entrance");
  for (const width of [320,360,390]) {
    await p.setViewportSize({ width, height:800 });
    for (const cue of ["R1 · Human decision", "R6 · Human decision", "External outro and credits"]) {
      await jump(p, cue);
      const fit = await p.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth, op:document.querySelector("#op").getBoundingClientRect().right }));
      ok(fit.scroll <= fit.width && fit.op <= fit.width + 1, `${width}px ${cue}: scroll ${fit.scroll}, panel ${fit.op}`);
    }
  }
  const immediate = await p.context().newPage();
  await immediate.setViewportSize({width:360,height:800});
  await immediate.goto(URL + "?tour#control");
  ok(await immediate.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "fresh dedicated control has no entrance overflow");
  await immediate.waitForTimeout(320);
  ok(await immediate.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "settled dedicated control stays inside viewport");
  await immediate.close();
  await p.addStyleTag({content:':root{--sans:Arial,sans-serif;--mono:monospace;--disp:Impact,sans-serif}'});
  await jump(p, "R6 · Human decision");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "fallback fonts fit");
});

await test("Apply October 14 plan preserves media and saved results, blocks active legacy sessions", async open => {
  const p = await open();
  await p.evaluate(() => {
    const s = {v:1,cue:42,rounds:{6:{votes:{A:2,B:30,C:1,D:0},votes2:{A:40,B:1,C:0,D:0},judges:["HAI","HAI","HAI","AI"]}},clock:{show:Date.now(),round:Date.now(),rsid:6},config:{lineup:[1,2,3,4,5,6],pivotAfter:5,combined:[6],sfx:true,media:{vig1:{name:"retained.mp4",size:123,v:1}},pin:"1234567"}};
    localStorage.setItem("aivh-show-v1", JSON.stringify(s));
  });
  await p.reload(); await p.waitForSelector(".op-pos b");
  ok((await p.locator(".cue").allTextContents()).some(x => x.includes("Poll 2")), "legacy flow preserved");
  const before = await p.evaluate(() => localStorage.getItem("aivh-show-v1"));
  await act(p, '[data-act="applyplan"]');
  eq(await p.evaluate(() => localStorage.getItem("aivh-show-v1")), before, "active state byte-preserved");
  ok((await p.textContent("#d-set")).includes("Export the saved results"), "explicit export/reset instruction");
  await p.evaluate(() => {
    const s=JSON.parse(localStorage.getItem("aivh-show-v1"));
    s.cue=0; s.clock={show:null,round:null}; s.rounds={};
    localStorage.setItem("aivh-show-v1",JSON.stringify(s));
  });
  await p.reload(); await p.waitForSelector(".op-pos b");
  await act(p, '[data-act="applyplan"]');
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem("aivh-show-v1")));
  eq(after.config.showPlan,"oct14-v3","applied plan");
  eq(after.config.media.vig1.name,"retained.mp4","uploaded metadata retained");
  eq(after.config.pin,"","v3 Slido event selected");
  eq(after.config.previousPolling.pin,"1234567","previous Kahoot PIN archived");
  ok(!after.clock.show,"clock not started by applying");
  eq(after.rounds[6].votes.B,0,"reset results retained");
  await acknowledgeFallback(p);await act(p,'[data-act="go"]');
  await jump(p,"Score before round 6");
  ok((await p.textContent("[data-sclock]")).includes("of 10:00"),"ten-minute round budget");
});

await test("saved85-minute six-scored plans require v3 application or intentional preflight acknowledgment",async open=>{
  const p=await open();await legacyPlan(p);await jump(p,"Pre-show: take your seats");
  const before=await p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")));
  eq(before.config.showPlan,"oct14-feedback","explicit earlier plan saved");
  eq(before.config.showTiming,"oct11-85-20","current timing does not prove current flow");
  ok(/(?:earlier|saved|not).*v3|v3.*(?:plan|apply)/i.test(await p.locator("[data-preflight]").textContent()),"preflight names the v3 plan mismatch");
  await act(p,'[data-act="go"]');eq(await label(p),"Pre-show: take your seats","opening GO held for old plan");
  let state=await p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")));
  eq(JSON.stringify(state.config),JSON.stringify(before.config),"held GO preserves saved configuration");
  eq(JSON.stringify(state.rounds),JSON.stringify(before.rounds),"held GO preserves saved results");
  ok(!state.clock.show,"held GO starts no show clock");
  await acknowledgeFallback(p);await pause(p);await act(p,'[data-act="go"]');
  eq(await label(p),"External opener · hold black","intentional acknowledgment permits retained flow");
  state=await p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")));
  eq(state.config.showPlan,"oct14-feedback","acknowledgment does not silently migrate");
  await p.evaluate(saved=>localStorage.setItem("aivh-show-v1",JSON.stringify(saved)),before);
  await p.reload();await p.waitForSelector(".op-pos");await act(p,'[data-act="applyplan"]');
  state=await p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")));
  eq(state.config.showPlan,"oct14-v3","guarded clean application selects current flow");
  ok(!state.clock.show,"application starts no show clock");
  eq(await p.locator('[data-cue-type="judges"]').count(),5,"applied show has five scored rounds");
  ok(!/(?:earlier|saved|not).*v3|v3.*(?:plan|apply)/i.test(await p.locator("[data-preflight]").textContent()),"plan mismatch clears after application");
});

await test("screens stay silent even when a saved legacy sfx preference is true", async open => {
  const p = await open();
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("aivh-show-v1") || "null");
    const next = s || {v:1,config:{showPlan:"oct14-feedback",sfx:true}};
    next.config.sfx=true; localStorage.setItem("aivh-show-v1",JSON.stringify(next));
  });
  await p.addInitScript(() => {window.screenAudioContexts=0; const Audio=window.AudioContext; window.AudioContext=class extends Audio {constructor(...args){super(...args);window.screenAudioContexts++;}};});
  await p.reload(); await p.waitForSelector(".op-pos b");
  await p.click("#stage");
  await jump(p,"R2 · Poll");
  await p.evaluate(() => {const s=JSON.parse(localStorage.getItem("aivh-show-v1"));s.timer={endsAt:Date.now()+1000,total:45};localStorage.setItem("aivh-show-v1",JSON.stringify(s));});
  await p.reload(); await p.waitForTimeout(1400);
  await jump(p,"R2 · AI decision");
  await jump(p,"R2 · Human decision"); await setVotes(p,{A:1,B:30,C:2,D:3});
  await jump(p,"R2 · Judges"); await setJudges(p,["H","H","H","AI"]); await reveal(p);
  eq(await p.evaluate(()=>window.screenAudioContexts),0,"no synthesis");
});

await test("tour Start over absorbs a double send and stays on the pre-show", async open => {
  const p = await open("?tour");
  await legacyPlan(p,"aivh-tour-v1");
  await jump(p, "Audience Q&A");
  await p.dblclick('[data-tour="1"]');
  eq(await label(p), "Pre-show: take your seats", "double Start over does not also press Next");
  await acknowledgeFallback(p);
  await pause(p); await p.locator('[data-tour="1"]').focus(); await p.keyboard.press("Space");
  eq(await label(p), "External opener · hold black", "deliberate Next still advances");
});

await test("legacy score bulbs pulse once after verdict; ordinary and reduced motion remain bounded", async open => {
  const p = await open();
  await legacyPlan(p);
  await jump(p, "R2 · AI decision");
  const motion = await p.evaluate(() => document.querySelector("#scene").getAnimations({subtree:true}).map(a => a.effect.getTiming()));
  ok(motion.length > 0 && motion.every(t => t.duration >= 180 && t.duration + t.delay <= 320), "ordinary entrance completes in 180–320ms");
  await jump(p, "R2 · Poll"); await act(p, '[data-act="timerstop"]');
  eq(await p.textContent(".bug-clock .lbl"), "Vote closed", "stopped clock is visibly closed");
  await jump(p, "R2 · Human decision"); await setVotes(p, { A:5, B:40, C:20, D:10 });
  await jump(p, "R2 · Judges"); await setJudges(p, ["H","H","H","AI"]);
  ok((await p.textContent(".op-next")).includes("Reveal judges"), "On GO describes reveal in place");
  await reveal(p);
  eq(await p.locator("#bug .score-earned").count(), 0, "no pulse before awarded point");
  await p.waitForFunction(() => document.querySelector("#bug .score-earned"));
  eq(await legacyScore(p), "1-0", "pulse uses awarded point");
  await act(p, '[data-act="black"]');
  eq(await p.locator("#bug .score-earned").count(), 0, "same score update does not replay pulse");
  await jump(p, "R2 · Judge debate");
  eq(await p.locator("#bug .score-earned").count(), 0, "cue entry does not replay unchanged point");
  await p.reload(); await p.waitForSelector(".op-pos b");
  eq(await p.locator("#bug .score-earned").count(), 0, "refresh does not award or pulse an existing point");
  await jump(p, "R2 · Judges");
  eq(await legacyScore(p), "1-0", "refresh keeps awarded score");
  await p.emulateMedia({reducedMotion:"reduce"});
  await jump(p, "R3 · AI decision");
  eq(await p.evaluate(() => document.querySelector("#stage").getAnimations({subtree:true}).length), 0, "reduced motion has no decorative animation");
  await jump(p, "R3 · Human decision"); await setVotes(p, { A:1, B:30, C:2, D:3 });
  await jump(p, "R3 · Judges"); await setJudges(p, ["H","H","H","AI"]); await reveal(p);
  ok((await vbar(p)).includes("Humans take"), "reduced motion verdict is available immediately");
  eq(await legacyScore(p), "2-0", "reduced motion score matches verdict immediately");

});

// Chrome can exit before its close RPC resolves.
await test("saved97-minute timing is preserved until a guarded clean setup applies85 plus20", async open => {
  const p=await open();
  await p.evaluate(() => localStorage.setItem("aivh-show-v1",JSON.stringify({v:1,cue:0,clock:{show:null,round:null},rounds:{1:{votes:{A:7,B:2,C:0,D:0}}},config:{showPlan:"oct14-feedback",useChrisAI:true,media:{vig4:{name:"kept.mp4",size:123,v:2}},ai:{2:{d:"D",c:57,why:"Preserve custom analysis",risk:"Preserve custom risk"}}}})));
  await p.reload();await p.waitForSelector(".op-pos");
  await jump(p,"Audience Q&A");ok((await p.textContent("#scene")).includes("15 minutes"),"saved old Q&A retained");
  await jump(p,"Pre-show: take your seats");await act(p,'[data-act="applyplan"]');
  ok((await p.textContent("#d-set")).includes("Export the saved results"),"votes block timing change");
  let state=await p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")));
  eq(state.rounds[1].votes.A,7,"votes retained");eq(state.config.showTiming,"oct6-97","old timing retained");
  await act(p,'[data-act="reset"]');await p.waitForTimeout(700);await act(p,'[data-act="reset"]');
  state=await p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")));eq(state.rounds[1].votes.A,0,"explicit reset completed before setup");
  await act(p,'[data-act="applyplan"]');state=await p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")));
  eq(state.config.showTiming,"oct11-85-20","latest timing selected");eq(state.config.media.vig4.name,"kept.mp4","upload metadata retained");eq(state.config.ai[2].d,"D","custom reply retained");
  await jump(p,"Audience Q&A");ok((await p.textContent("#scene")).includes("20 minutes"),"new Q&A shown");
  ok(!state.clock.show,"setup does not start show clock");
});

await test("Q&A starts its separate20-minute clock at the closing handoff in both windows", async open => {
  const p=await open();await jump(p,"Audience Q&A");
  let state=await p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")));ok(!state.clock.qa,"cue inspection does not start Q&A");
  await jump(p,"Pre-show: take your seats");await acknowledgeFallback(p);await act(p,'[data-act="go"]');
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("aivh-show-v1"));s.clock.show=Date.now()-85*60000;localStorage.setItem("aivh-show-v1",JSON.stringify(s));});
  await p.reload();await p.waitForSelector(".op-pos");await jump(p,"Futureproof CTA");
  await pause(p);await act(p,'[data-act="go"]');eq(await label(p),"External outro and credits · hold black","closing holds");
  await pause(p);await act(p,'[data-act="go"]');eq(await label(p),"Audience Q&A","Q&A follows");
  state=await p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")));ok(state.clock.qa>state.clock.show,"Q&A handoff timestamp saved");
  const clock=()=>p.evaluate(()=>document.querySelector('[data-sclock] span:nth-child(2)').textContent);const held=await clock();
  await p.waitForTimeout(1300);eq(await clock(),held,"main clock holds at handoff");ok((await p.textContent("[data-sclock]")).includes("of 20:00"),"Q&A has own budget");
  const control=await p.context().newPage();await control.goto(URL+"#control");await control.waitForSelector(".op-pos");
  ok((await control.textContent("[data-sclock]")).includes("of 20:00"),"control shows Q&A budget");
  eq(await control.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")).clock.qa),state.clock.qa,"windows share handoff timestamp");
});

await test("v3 round budgets start on scorecards after opening GO, survive titles/films and freeze at Dom's interruption",async open=>{
  const p=await open();
  await loadTestVideo(p,"vig2",1);
  await jump(p,"Score before round 2");
  const saved=()=>p.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")));
  let state=await saved();ok(!state.clock.show&&!state.clock.round,"pre-show cue inspection starts no clocks");
  await jump(p,"Pre-show: take your seats");await acknowledgeFallback(p);await act(p,'[data-act="go"]');
  await jump(p,"Score before round 2");state=await saved();
  const start=state.clock.round;ok(start>=state.clock.show,"scorecard starts active round");eq(state.clock.rsid,2,"scorecard identifies upcoming round");
  await jump(p,"R2 · Code Red");eq((await saved()).clock.round,start,"title retains scorecard start");
  await jump(p,"R2 · Video vignette");eq((await saved()).clock.round,start,"film retains scorecard start");
  await jump(p,"Score before round 6");
  await jump(p,"R6 · Human decision");await setVotes(p,{A:1,B:2,C:30,D:2});
  await jump(p,"R6 · AI decision");await pause(p);await act(p,'[data-act="go"]');
  eq(await p.locator("#stage").getAttribute("data-scene"),"interruption","AI goes directly into Dom's interruption");
  state=await saved();ok(state.clock.roundEnd>=state.clock.round,"round-six endpoint saved");
  const clock=()=>p.evaluate(()=>[...document.querySelectorAll('[data-sclock] span')].find(e=>e.textContent.startsWith("This round"))?.textContent);
  const frozen=await clock();ok(frozen.includes("of 10:00"),"frozen round keeps ten-minute budget");
  await p.waitForTimeout(1300);eq(await clock(),frozen,"round-six clock stops during interruption");
  const control=await open("#control");
  eq((await control.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")))).clock.roundEnd,state.clock.roundEnd,"booth shares frozen endpoint");
  eq(await control.locator('[data-cue-type="judges"][data-cue-sid="6"]').count(),0,"no final judging gate");
});

await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
const failed = results.filter(r => !r[0]);
for (const [pass, name, why] of results) console.log(`${pass ? "PASS" : "FAIL"}  ${name}${why ? `\n      ${why}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} passed against ${URL}`);
process.exit(failed.length ? 1 : 0);
