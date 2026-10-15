import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(path.join(app, "media/manifest.json")));
const plan = JSON.parse(readFileSync(path.join(app, "production-drafts/scenario-04/chat-pacing-oct14.json")));
const {chromium} = createRequire(path.join(process.env.PLAYWRIGHT_FROM || app, "package.json"))("@playwright/test");
const option = name => {const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1];};
let server;
let origin = option("--url");
if (!origin) {
  server = createServer((req, res) => {
    const file = path.join(app, decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/$/, "/index.html"));
    if (!file.startsWith(app + path.sep)) {res.writeHead(403).end(); return;}
    try {
      const bytes = readFileSync(file);
      const types = {".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".json":"application/json", ".mp4":"video/mp4", ".vtt":"text/vtt"};
      res.writeHead(200, {"Content-Type":types[path.extname(file)] || "application/octet-stream", "Content-Length":bytes.length}).end(bytes);
    } catch {res.writeHead(404).end();}
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
}
origin = origin.replace(/\/$/, "");
const browser = await chromium.launch({channel:"chrome"});
const checks = [], errors = [], samples = [];
const check = message => {checks.push(message); console.log("PASS", message);};
const act = (p, selector) => p.evaluate(s => document.querySelector(s).click(), selector);
const jump = (p, label) => p.evaluate(label => [...document.querySelectorAll("[data-act=jump]")].find(b => b.textContent.includes(label)).click(), label);
try {
  const context = await browser.newContext({viewport:{width:1600, height:900}});
  context.on("page", p => {p.on("pageerror", e => errors.push(e.message)); p.on("dialog", d => d.accept());});
  const stage = await context.newPage();
  await stage.goto(origin + "/");
  await stage.waitForSelector(".op-pos");
  const old = catalog.vig4.previous_review_cut;
  await stage.locator('input[data-media="vig4"]').setInputFiles({name:old, mimeType:"video/mp4", buffer:readFileSync(path.join(app, "media", old))});
  await stage.waitForFunction(name => JSON.parse(localStorage.getItem("aivh-show-v1"))?.config?.media.vig4?.name === name, old);
  await stage.waitForFunction(() => document.querySelector("#op").textContent.includes("Outdated release"));
  const before = await stage.evaluate(() => {const s=JSON.parse(localStorage.getItem("aivh-show-v1")); return {rounds:s.rounds, clock:s.clock};});
  await act(stage, '[data-act=mrelease][data-slot=vig4]');
  await stage.waitForFunction(file => JSON.parse(localStorage.getItem("aivh-show-v1")).config.media.vig4?.name === file, catalog.vig4.file);
  const replacement = await stage.evaluate(() => {const s=JSON.parse(localStorage.getItem("aivh-show-v1")); return {media:s.config.media.vig4, rounds:s.rounds, clock:s.clock};});
  assert.equal(replacement.media.sha256, catalog.vig4.sha256);
  assert.equal(replacement.media.previous.name, old);
  assert.deepEqual({rounds:replacement.rounds, clock:replacement.clock}, before);
  await act(stage, '[data-act=mrestore][data-slot=vig4]');
  await stage.waitForFunction(name => JSON.parse(localStorage.getItem("aivh-show-v1")).config.media.vig4?.name === name, old);
  await act(stage, '[data-act=mrelease][data-slot=vig4]');
  await stage.waitForFunction(file => JSON.parse(localStorage.getItem("aivh-show-v1")).config.media.vig4?.name === file, catalog.vig4.file);
  check("previous released cut is recognized, replaces explicitly and restores; votes and clock are preserved");
  await act(stage, "[data-act=mreleaseall]");
  await stage.waitForFunction(() => document.querySelector("[data-preflight] h3")?.textContent.startsWith("6 of 6"), null, {timeout:120000});
  const saved = await stage.evaluate(() => JSON.parse(localStorage.getItem("aivh-show-v1")).config.media);
  for (let id=1; id<=6; id++) assert.equal(saved[`vig${id}`].sha256, catalog[`vig${id}`].sha256);
  assert.equal(saved.vig4.duration, 82);
  const captionHash = await stage.evaluate(async () => {
    const caption = JSON.parse(localStorage.getItem("aivh-show-v1")).config.media.vig4.captionsVtt;
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(caption)))].map(v => v.toString(16).padStart(2,"0")).join("");
  });
  assert.equal(captionHash, catalog.vig4.captions.sha256);
  check("all six actual films and the revised verified captions are installed together");
  const control = await context.newPage();
  await control.goto(origin + "/#control");
  await control.waitForSelector(".op-pos");
  await jump(control, "R4 · Video vignette");
  await stage.waitForFunction(() => document.querySelector("#media video")?.readyState >= 2);
  await control.waitForFunction(() => document.querySelector("#media video")?.readyState >= 2);
  assert.equal(await stage.locator("#media video").evaluate(v => v.muted), false);
  assert.equal(await control.locator("#media video").evaluate(v => v.muted), true);
  assert.equal(await stage.locator("#media video").evaluate(v => v.textTracks[0].mode), "disabled");
  await act(control, "[data-act=vrestart]");
  const sample = async time => {
    await stage.waitForFunction(t => document.querySelector("#media video").currentTime >= t, time, {timeout:25000});
    const result = await stage.locator("#media video").evaluate(async v => {
      const c = document.createElement("canvas"); c.width=1920; c.height=1080;
      const ctx=c.getContext("2d"); ctx.drawImage(v,0,0);
      const data=ctx.getImageData(310,235,1580,755).data; let bright=0;
      const cells=Array(16*8).fill(0);
      for(let i=0;i<data.length;i+=4) if(data[i]>160 && data[i+1]>160 && data[i+2]>160) {bright++;const pixel=i/4,x=pixel%1580,y=Math.floor(pixel/1580);cells[Math.floor(y*8/755)*16+Math.floor(x*16/1580)]++;}
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map(v=>v.toString(16).padStart(2,"0")).join("");
      return {time:v.currentTime, bright, hash, cells};
    });
    samples.push(result); return result;
  };
  const blank = await sample(.5);
  assert.ok(blank.bright < 100);
  assert.ok((await sample(4.75)).bright < 100);
  // Compare text distribution with tolerance for H.264 quantization between I/P frames.
  const pictureDelta=(a,b)=>a.cells.reduce((total,value,index)=>total+Math.abs(value-b.cells[index]),0);
  let prior = blank;
  for(let i=0;i<plan.chat_messages.length;i++) {
    const m=plan.chat_messages[i];
    const after=await sample(m.at+.5);
    assert.ok(pictureDelta(after,prior)>1500, `message ${i+1} changes the rolling chat viewport at its scheduled arrival`);
    if(i<plan.chat_messages.length-1) {
      const read=await sample(m.at+m.reading_seconds-.25);
      const suspense=await sample(plan.chat_messages[i+1].at-.25);
      assert.ok(pictureDelta(read,after)<1000, "the message stays readable throughout its full reading time");
      assert.ok(pictureDelta(suspense,after)<1000, "no new chat during the five-second suspense interval");
    }
    prior=after;
  }
  await stage.waitForFunction(() => document.querySelector("#media video").ended, null, {timeout:20000});
  await stage.waitForTimeout(2500);
  assert.match(await control.locator(".op-pos b").textContent(), /R4.*Video vignette/);
  assert.equal(await stage.locator("#stage").getAttribute("data-scene"), "video");
  const endPicture=await stage.locator("#media video").evaluate(v=>({width:v.videoWidth, duration:v.duration, time:v.currentTime, ended:v.ended}));
  assert.equal(endPicture.width,1920); assert.equal(endPicture.duration,82); assert.equal(endPicture.ended,true);
  const finalReadability=await stage.locator("#media video").evaluate(v => {
    const c=document.createElement("canvas");c.width=1920;c.height=1080;
    const ctx=c.getContext("2d");ctx.drawImage(v,0,0);
    const count=(x,y,w,h,match)=>{const data=ctx.getImageData(x,y,w,h).data;let found=0;for(let i=0;i<data.length;i+=4)if(match(data[i],data[i+1],data[i+2]))found++;return found;};
    return {socBubble:count(422,477,1454,174,(r,g,b)=>b>r+20&&b>g+15),question:count(180,890,1560,100,(r,g,b)=>r>200&&g>200&&b>200)};
  });
  assert.ok(finalReadability.socBubble>1000,"SOC chat bubble is distinct from vendor messages");
  assert.ok(finalReadability.question>2000,"closing question is bright and inside the safe frame");
  check("natural 1x playback has five empty seconds, all five readable arrivals and five-second suspense gaps");
  check("final vendor denial, manager instruction and service warning remain on the projector after film end until manual GO");
  if(option("--receipt")) await stage.screenshot({path:option("--receipt").replace(/\.json$/, "-final.png")});
  await act(control,"[data-act=go]");
  await stage.waitForFunction(() => document.querySelector("#stage").dataset.scene === "brief");
  await control.waitForFunction(() => document.querySelector(".op-pos b").textContent.includes("R4 · Briefing"));
  check("Vipin's control-window GO advances both windows to the complete incident briefing");
  await stage.waitForFunction(() => navigator.serviceWorker.controller);
  await context.setOffline(true);
  await stage.reload(); await control.reload();
  await stage.waitForSelector(".op-pos"); await control.waitForSelector(".op-pos");
  await jump(control,"R4 · Video vignette");
  await stage.waitForFunction(() => document.querySelector("#media video")?.readyState >= 2);
  await act(control,"[data-act=vpause]");
  await stage.waitForFunction(() => document.querySelector("#media video").paused);
  await act(control,"[data-act=vcc]");
  await stage.waitForFunction(() => document.querySelector("#media video").textTracks[0]?.mode === "showing" && document.querySelector("#media video").textTracks[0]?.cues?.length === 5);
  const last = await stage.locator("#media video").evaluate(v => {
    const cue=[...v.textTracks[0].cues].at(-1);return {start:cue.startTime,end:cue.endTime,text:cue.text,blob:v.src.startsWith("blob:")};
  });
  assert.equal(last.start,74); assert.equal(last.end,82); assert.equal(last.blob,true);
  assert.match(last.text,/Disabling our access will interrupt critical support services/);
  await act(control,"[data-act=vrestart]");
  await stage.waitForFunction(() => document.querySelector("#media video").currentTime < 1 && !document.querySelector("#media video").paused);
  await act(control,"[data-act=vpause]");
  await stage.waitForFunction(() => document.querySelector("#media video").paused);
  check("revised film and minute-crossing captions survive two-window offline reload, pause and restart");
  await context.setOffline(false);
  const review = await context.newPage();
  await review.goto(origin + "/review.html#scenario-04-film");
  const card=review.locator("#scenario-04-film");
  assert.match(await card.locator(".duration").textContent(),/82/);
  assert.ok((await card.locator("source").getAttribute("src")).endsWith(catalog.vig4.file));
  assert.equal(await card.locator('[data-seek="74"]').textContent(),"01:14");
  assert.ok((await card.locator(".film-actions a").first().getAttribute("href")).includes("oct14-chat"));
  check("review card, transcript seeks and isolated rehearsal use the new cut");
  const liveBeforeTour = await stage.evaluate(() => localStorage.getItem("aivh-show-v1"));
  const tour = await context.newPage();
  await tour.goto(origin + "/?tour&film=4&revision=oct14-chat");
  await tour.waitForFunction(file => JSON.parse(localStorage.getItem("aivh-film4-tour-v1-oct14-chat"))?.config?.media?.vig4?.name === file, catalog.vig4.file);
  assert.equal(await stage.evaluate(() => localStorage.getItem("aivh-show-v1")), liveBeforeTour);
  check("fresh scenario-4 rehearsal installs the new cut without changing real-show state");
  assert.deepEqual(errors,[]);
  const receipt={origin,asset:catalog.vig4,checks,samples,finalReadability,pageerrors:errors,natural_playback_rate:1,final_hold_seconds_observed:2.5,boundary:"Actual-app Chrome verification; physical projected group readability remains today's crew rehearsal."};
  if(option("--receipt"))writeFileSync(option("--receipt"),JSON.stringify(receipt,null,2)+"\n");
} finally {
  // Chrome can exit before its close RPC resolves.
  await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
process.exit(0);
