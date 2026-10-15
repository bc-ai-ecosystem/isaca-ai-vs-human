import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(path.join(app, "media/manifest.json"), "utf8"));
const {chromium} = createRequire(path.join(process.env.PLAYWRIGHT_FROM || app,"package.json"))("@playwright/test");
const server = createServer((req,res) => {
  const file = path.join(app,decodeURIComponent(new URL(req.url,"http://localhost").pathname).replace(/^\/$/,"/index.html"));
  if (!file.startsWith(app + path.sep)) {res.writeHead(403).end();return;}
  try {
    const bytes = readFileSync(file);
    const types = {".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".mp4":"video/mp4",".mp3":"audio/mpeg",".jpg":"image/jpeg",".png":"image/png",".vtt":"text/vtt"};
    res.writeHead(200,{"Content-Type":types[path.extname(file)] || "text/plain","Content-Length":bytes.length});
    res.end(bytes);
  } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const urlArg=process.argv.indexOf("--url");
const base = urlArg>=0 ? process.argv[urlArg+1].replace(/\/$/,"") : `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({channel:"chrome"});
const ctx = await browser.newContext({viewport:{width:1600,height:900}});
const errors = [], checks = [];
const stage = await ctx.newPage();
stage.on("pageerror",e=>errors.push(e.message));
stage.on("dialog",d=>d.accept());
const act = async (p,selector)=>{
  if(selector === "[data-act=go]")await p.waitForTimeout(350);
  return p.evaluate(s=>document.querySelector(s).click(),selector);
};
const jump = (p,label)=>p.evaluate(label=>{
  const button=[...document.querySelectorAll("[data-act=jump]")].find(b=>b.textContent.includes(label));
  if(!button)throw new Error(`Missing cue ${label}`);
  button.click();
},label);
const check = message=>{checks.push(message);console.log("PASS",message);};

try {
  await stage.goto(base+"/");
  await stage.waitForSelector(".op-pos");
  await stage.evaluate(()=>{document.querySelector("#d-set").open=true;});
  for(let id=1;id<=6;id++) {
    const slot=`vig${id}`, asset=catalog[slot];
    console.log("RUN install",slot,asset.file);
    await stage.waitForFunction(slot=>{const button=document.querySelector(`[data-act=mrelease][data-slot="${slot}"]`);return button&&!button.disabled;},slot,{timeout:30000});
    await act(stage,`[data-act=mrelease][data-slot=${slot}]`);
    try {
      await stage.waitForFunction(({slot,file})=>JSON.parse(localStorage.getItem("aivh-show-v1"))?.config.media[slot]?.name===file || /failed|couldn't|cancelled|unknown|invalid|nothing was installed/i.test(document.querySelector(".busy")?.textContent || ""),{slot,file:asset.file},{timeout:120000});
      const loaded=await stage.evaluate(slot=>({file:JSON.parse(localStorage.getItem("aivh-show-v1")||"null")?.config.media[slot]?.name,message:document.querySelector(".busy")?.textContent}),slot);
      assert.equal(loaded.file,asset.file,`${slot} must install the verified release: ${loaded.message || "missing metadata"}`);
    } catch(error) {
      console.error(JSON.stringify(await stage.evaluate(slot=>({slot,installed:Object.entries(JSON.parse(localStorage.getItem("aivh-show-v1")||"null")?.config.media || {}).map(([slot,asset])=>({slot,file:asset.name,sha256:asset.sha256})),message:document.querySelector(".busy")?.textContent}),slot)));
      throw error;
    }
    console.log("INSTALLED",slot);
    const saved=await stage.evaluate(slot=>new Promise((resolve,reject)=>{
      const request=indexedDB.open("aivh-media",1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction("files","readonly"),read=tx.objectStore("files").get(slot);
        tx.oncomplete=async()=>{
          db.close();
          const file=read.result;
          const hash=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
          resolve({name:file.name,size:file.size,sha256:[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,"0")).join("")});
        };
        tx.onerror=()=>reject(tx.error);
      };
    }),slot);
    assert.deepEqual(saved,{name:asset.file,size:asset.bytes,sha256:asset.sha256});
    if(asset.captions){
      const caption=await stage.evaluate(slot=>JSON.parse(localStorage.getItem("aivh-show-v1")).config.media[slot].captionsVtt,slot);
      assert.ok(caption.startsWith("WEBVTT"));
      const actual=await stage.evaluate(async text=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,"0")).join(""),caption);
      assert.equal(actual,asset.captions.sha256);
    }
  }
  check("all six actual films are installed together with complete catalogue hashes");
  assert.equal(await stage.locator("[data-act=jump]").count(),60,"complete v3 show has60 cues");
  assert.equal(await stage.locator('[data-cue-type="scorecard"]').count(),5);
  assert.equal(await stage.locator('[data-cue-type="judges"]').count(),5);
  assert.deepEqual(JSON.parse(readFileSync(path.join(app,"media/fallbacks.json"),"utf8")),{});
  const review = await ctx.newPage();
  await review.goto(base+"/review.html#vendor-spoken-fallback");
  assert.equal(await review.locator("#vendor-spoken-fallback audio").count(),0);
  assert.equal(await review.locator('#vendor-spoken-fallback a[href="emergency.html"]').count(),1);
  await review.close();
  check("superseded spoken fallback is retired; complete current emergency script is accessible");
  const control=await ctx.newPage();
  control.on("pageerror",e=>errors.push(e.message));
  await control.goto(base+"/#control");
  await control.waitForSelector(".op-pos");
  await control.waitForFunction(() => document.querySelector("[data-preflight] h3")?.textContent.startsWith("6 of 6"));
  await control.evaluate(()=>document.querySelector('[data-act="ackpreflight"]')?.click());
  await act(control,"[data-act=go]");
  await stage.waitForFunction(()=>document.querySelector("#stage").dataset.scene==="externalOpening");
  assert.ok(await stage.evaluate(()=>JSON.parse(localStorage.getItem("aivh-show-v1")).clock.show));
  assert.equal(await stage.locator("#scene").textContent(),"");
  assert.equal(await stage.locator("#bug").isVisible(),false);
  await act(control,"[data-act=go]");
  await stage.waitForFunction(()=>document.querySelector("#stage").dataset.scene==="rules");
  check("opening GO starts the clock and external playback returns to rules manually");
  for(let id=1;id<=6;id++) {
    await jump(control,`R${id} · Video vignette`);
    await stage.waitForFunction(()=>document.querySelector("#media video")?.videoWidth===1920);
    await control.waitForFunction(()=>document.querySelector("#media video")?.videoWidth===1920);
    const meta=await stage.locator("#media video").evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,muted:v.muted}));
    assert.equal(meta.width,1920);assert.equal(meta.height,1080);assert.equal(meta.muted,false);
    assert.ok(Math.abs(meta.duration-catalog[`vig${id}`].duration_seconds)<0.05);
    assert.equal(await control.locator("#media video").evaluate(v=>v.muted),true);
    await stage.locator("#media video").evaluate(v=>{v.currentTime=1;return v.play();});
    await stage.waitForFunction(()=>document.querySelector("#media video").currentTime>1.15);
    await act(control,"[data-act=vpause]");
    await stage.waitForFunction(()=>document.querySelector("#media video").paused);
    await act(control,"[data-act=vrestart]");
    await stage.waitForFunction(()=>document.querySelector("#media video").currentTime<1);
    await stage.locator("#media video").evaluate(v=>{v.currentTime=v.duration-.15;return v.play();});
    await stage.waitForFunction(()=>document.querySelector("#media video").ended);
    assert.match(await control.locator(".op-pos b").textContent(),/Video vignette/);
    await act(control,"[data-act=go]");
    await stage.waitForFunction(()=>document.querySelector("#stage").dataset.scene==="brief");
  }
  check("all six real films play, pause, restart, hold at end and advance manually across two windows");
  const cues=await control.locator("[data-act=jump]").allTextContents();
  assert.equal(cues.filter(x=>/ · Poll$/.test(x)).length,6);
  assert.equal(cues.filter(x=>/Poll 2|Pivot|Final score/.test(x)).length,0);
  assert.equal(await control.locator('[data-cue-type="judges"][data-cue-sid="6"], [data-cue-type="debate"][data-cue-sid="6"]').count(),0);
  for(let id=1;id<=5;id++) {
    await jump(control,`R${id} · Judge debate`);
    await stage.waitForFunction(()=>document.querySelector("#stage").dataset.scene==="debate");
    assert.equal((await stage.locator("#scene").textContent()).trim(),"Cyber Judges Debate");
    assert.equal(await stage.locator("#bug").isVisible(),false);
    assert.match(await control.locator("#op").textContent(),/Debate prompt/);
  }
  const sequence=await control.locator(".cue").evaluateAll(els=>els.map(e=>({type:e.dataset.cueType,sid:e.dataset.cueSid})));
  const finalAI=sequence.findIndex(c=>c.type==="ai"&&c.sid==="6");
  assert.ok(!sequence.slice(0,finalAI+1).some(c=>c.type.startsWith("collaboration")));
  assert.deepEqual(sequence.slice(-6).map(c=>c.type),["interruption","collaboration","collaborationDiscussion","thanks","externalClosing","qa"]);
  check("six single polls, five debate holds, five live scorecards and no early collaboration reveal");
  await jump(control,"Score before round 6");
  await jump(control,"R6 · Human decision");
  await control.evaluate(()=>{
    for(const [key,value] of Object.entries({A:1,B:2,C:30,D:2})) {
      const input=document.querySelector(`[data-vote="${key}"]`);input.value=String(value);input.dispatchEvent(new Event("change",{bubbles:true}));
    }
  });
  await jump(control,"R6 · AI decision");
  await stage.waitForFunction(()=>document.querySelector("#stage").dataset.scene==="ai");
  assert.ok(!/Human\s*\+\s*AI/i.test(await stage.locator("#scene").textContent()),"R6 AI retains closing surprise");
  for(const type of ["interruption","collaboration","collaborationDiscussion","thanks","externalClosing"]) {
    await act(control,"[data-act=go]");
    await stage.waitForFunction(type=>document.querySelector("#stage").dataset.scene===type,type);
    assert.equal(await stage.locator("#bug").isVisible(),false);
    await stage.waitForTimeout(type==="collaboration"?3300:400);
    assert.equal(await stage.locator("#stage").getAttribute("data-scene"),type,`${type} holds for GO`);
    if(type==="collaboration") {
      assert.equal(await stage.locator(".morph-vs").evaluate(el=>getComputedStyle(el).opacity),"0","completed reveal hides versus");
      assert.equal(await stage.locator(".morph-plus").evaluate(el=>getComputedStyle(el).opacity),"1","completed reveal shows plus");
    }
    if(type==="externalClosing")assert.equal(await stage.locator("#scene").textContent(),"");
  }
  assert.match(await control.locator("#copy-r").inputValue(),/\| 6 \|.*\|\s*\| Unscored closing discussion \|/i);
  await act(control,"[data-act=go]");
  await stage.waitForFunction(()=>document.querySelector("#stage").dataset.scene==="qa");
  assert.match(await stage.locator("#scene").textContent(),/20 minutes/);
  check("unscored R6 leads to collaboration, CTA, held external closing and full Q&A manually");
  await stage.waitForFunction(()=>navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await stage.reload();await control.reload();
  await stage.waitForSelector(".op-pos");await control.waitForSelector(".op-pos");
  for(let id=1;id<=6;id++) {
    await jump(control,`R${id} · Video vignette`);
    await stage.waitForFunction(()=>document.querySelector("#media video")?.videoWidth===1920);
    await stage.locator("#media video").evaluate(v=>v.play());
    await stage.waitForFunction(()=>document.querySelector("#media video").currentTime>0.15);
    assert.ok(await stage.locator("#media video").evaluate(v=>v.src.startsWith("blob:")));
    if(catalog[`vig${id}`].captions){
      if(await control.locator("[data-act=vcc]").getAttribute("aria-pressed")==="false")await act(control,"[data-act=vcc]");
      await stage.waitForFunction(()=>document.querySelector("#media video").textTracks[0]?.mode==="showing"&&document.querySelector("#media video").textTracks[0]?.cues?.length>0);
      assert.ok(await stage.locator("#media video track").evaluate(t=>t.src.startsWith("blob:")));
    }
  }
  check("all six saved films play after both windows reload offline");
  assert.deepEqual(errors,[]);
  const record={origin:base,films:[1,2,3,4,5,6].map(id=>catalog[`vig${id}`]),checks,pageerrors:errors,at:new Date().toISOString(),boundary:"Isolated workstation Chrome test; Chris event films and physical venue switching/acceptance remain unverified."};
  const receipt=process.argv.indexOf("--receipt");
  if(receipt>=0)writeFileSync(process.argv[receipt+1],JSON.stringify(record,null,2)+"\n");
} finally {
  await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,5000))]);
  const closed=new Promise(resolve=>server.close(resolve));
  server.closeAllConnections();
  await closed;
}
process.exit(0);
