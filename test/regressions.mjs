import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {webcrypto, createHash} from "node:crypto";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("QR generation retries after a transient script download failure", async () => {
  let attempts = 0;
  const window = {};
  const context = vm.createContext({
    window, state: { cue: 0 }, cues: [{ t: "preshow" }], render() {},
    document: {
      createElement: () => ({}),
      head: { appendChild(script) {
        attempts++;
        queueMicrotask(() => {
          if (attempts === 1) script.onerror(new Error("CDN unavailable"));
          else {
            window.qrcode = context.qrcode = () => ({
              addData() {}, make() {}, createSvgTag: () => "<svg>QR</svg>",
            });
            script.onload();
          }
        });
      } },
    },
  });
  vm.runInContext(html.slice(html.indexOf("let qrLib = null;"), html.indexOf("/* Sponsor logos")), context);
  vm.runInContext('qrSVG("https://kahoot.it/?pin=1234567")', context);
  await new Promise(setImmediate);
  vm.runInContext('qrSVG("https://kahoot.it/?pin=1234567")', context);
  await new Promise(setImmediate);
  assert.equal(attempts, 2);
  assert.equal(vm.runInContext('qrSVG("https://kahoot.it/?pin=1234567")', context), "<svg>QR</svg>");
});

test("offline install keeps the page when the QR CDN is unavailable", async () => {
  const cached = new Set();
  let install;
  const cache = {
    async add(url) {
      if (url !== "./") throw new Error("CDN unavailable");
      cached.add(url);
    },
    async addAll(urls) {
      if (urls.some(url => url !== "./")) throw new Error("CDN unavailable");
      urls.forEach(url => cached.add(url));
    },
  };
  const context = vm.createContext({
    caches: { open: async () => cache },
    fetch: async () => { throw new Error("Fonts unavailable"); },
    self: { skipWaiting() {}, addEventListener(name, handler) { if (name === "install") install = handler; } },
  });
  vm.runInContext(readFileSync(new URL("../sw.js", import.meta.url), "utf8"), context);
  let installed;
  install({ waitUntil(promise) { installed = promise; } });
  await installed;
  assert.ok(cached.has("./"), "the same-origin page must survive a CDN failure");
});

test("removing old backup rounds preserves the pivot's position among kept rounds", () => {
  const context = vm.createContext({
    defaults: () => ({ config: { lineup: [1, 2, 3, 4, 5, 6], pivotAfter: 5, combined: [6] } }),
    freshRounds: () => ({}),
    S: id => id >= 1 && id <= 6,
  });
  vm.runInContext(html.slice(html.indexOf("function merge(s){"), html.indexOf("let state = defaults();")), context);
  for (const [lineup, pivotAfter, expected] of [
    [[1, 7, 2, 3, 4, 5, 6], 6, 5],
    [[1, 2, 3, 4, 5, 6, 7], 5, 5],
    [[1, 7, 2, 3, 4, 5, 6], 0, 0],
  ]) {
    const result = context.merge({ v: 1, config: { lineup, pivotAfter } });
    assert.equal(result.config.pivotAfter, expected);
    assert.deepEqual(Array.from(result.config.lineup), [1, 2, 3, 4, 5, 6]);
  }
});


test("vote clock marks an expired or stopped poll closed, while round time stays separate", () => {
  const context = vm.createContext({
    state: { timer:{endsAt:5000}, clock:{rsid:2, round:1000} },
    mmss: ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`,
  });
  vm.runInContext(html.slice(html.indexOf("function boardClock("), html.indexOf("function updateBoardClock(")), context);
  assert.equal(context.boardClock({t:"poll", sid:2}, 3500).value, "0:02");
  assert.equal(context.boardClock({t:"poll", sid:2}, 5000).label, "Vote closed");
  assert.equal(context.boardClock({t:"poll", sid:2}, 6000).value, "0:00");
  assert.equal(context.boardClock({t:"brief", sid:2}, 62000).label, "Round time");
  assert.equal(context.boardClock({t:"brief", sid:2}, 62000).value, "1:01");
});


test("video range responses bypass the offline cache", async () => {
  let handler, writes = 0;
  const context = vm.createContext({
    self: {addEventListener(name, fn) { if (name === "fetch") handler = fn; }},
    fetch: async () => ({status:206, ok:true, clone() {throw new Error("Partial video must not be cached");}}),
    caches: {open: async () => ({put() { writes++; }}), match: async () => null},
    Response,
  });
  vm.runInContext(readFileSync(new URL("../sw.js", import.meta.url), "utf8"), context);
  let result;
  handler({request:{method:"GET",url:"https://example.test/media/film.mp4",headers:new Headers({Range:"bytes=0-1023"})},respondWith(p) {result=p;}});
  assert.equal((await result).status,206);
  assert.equal(writes,0);
});


for (const anotherWindow of [false, true]) {
  test(`release cannot overwrite an in-flight upload${anotherWindow ? " from another window" : ""}`, async () => {
    let unlockUpload, uploadStarted, releaseWaiting;
    const gate = new Promise(r => {unlockUpload = r;});
    const started = new Promise(r => {uploadStarted = r;});
    const waiting = new Promise(r => {releaseWaiting = r;});
    let storedState = null, blob, puts = Promise.resolve(), locks = Promise.resolve(), lockCount = 0;
    const writes = [];
    const bytes = Buffer.from("verified film");
    const asset = {file:"release.mp4",bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")};
    const idb = {
      get:async () => null,
      put(slot, file) {
        writes.push(file.name);
        if (writes.length === 1) uploadStarted(); else releaseWaiting();
        return puts = puts.then(async () => {await gate; blob = file;});
      },
    };
    const navigator = {locks:{request(key, fn) {
      if (++lockCount === 2) releaseWaiting();
      const pending = locks.then(fn);
      locks = pending.catch(() => {});
      return pending;
    }}};
    const makeWindow = () => {
      const state = {cue:0, config:{media:{}}};
      const context = vm.createContext({
        KEY:"test-show", state, cues:[{t:"preshow"}], idb, navigator, File, crypto:webcrypto, Uint8Array, AbortController,
        localStorage:{getItem:() => storedState},
        renderOp() {}, keepCue:fn => fn(), hasMedia:slot => !!state.config.media[slot],
        commit() {storedState = JSON.stringify(state);},
        fetch:async url => url.endsWith("manifest.json")
          ? {ok:true,json:async () => ({vig1:asset})}
          : {ok:true,arrayBuffer:async () => bytes},
      });
      vm.runInContext(html.slice(html.indexOf('let busy = "";'),html.indexOf('/* ---------- actions ---------- */')),context);
      // Real decode/rejection is checked in playback-reliability; this case isolates competing writes.
      context.inspectMedia=async()=>({duration:12,width:320,height:180});
      return context;
    };
    const uploader = makeWindow(), loader = anotherWindow ? makeWindow() : uploader;
    const release = loader.loadReleasedFilm("vig1");
    const upload = uploader.saveMedia("vig1",new File(["chosen"],"operator-chosen.mp4"));
    await started;
    await waiting;
    unlockUpload();
    assert.equal(await upload,true);
    assert.equal(await release,false);
    assert.deepEqual(writes,["operator-chosen.mp4"]);
    assert.equal(blob.name,"operator-chosen.mp4");
    assert.equal(JSON.parse(storedState).config.media.vig1.name,"operator-chosen.mp4");
  });
}

test("both released intro pilots leave full-opener readiness pending", () => {
  const context = vm.createContext({});
  vm.runInContext(html.slice(html.indexOf("function introTestDuration("), html.indexOf("function slotRow(")), context);
  assert.equal(context.introTestDuration({name:"night-desk-v1-8de8c74a3342.mp4"}),28);
  assert.equal(context.introTestDuration({name:"opener-intro-v1-5d4bedf03863.mp4"}),35);
  assert.equal(context.introTestDuration({name:"approved-event-master.mp4"}),0);
  assert.equal(context.introTestDuration(undefined),0);
});

test("scenario tours isolate all six film namespaces and reject invalid film selectors", () => {
  const setup = html.slice(html.indexOf('const TOUR ='), html.indexOf('function freshRounds()'));
  const key = search => vm.runInNewContext(setup + '\nKEY', {URLSearchParams, location:{search}});
  for (let n=1; n<=6; n++) assert.equal(key(`?tour&film=${n}`), `aivh-film${n}-tour-v1`);
  for (const n of ['0','7','01','2x','']) assert.equal(key(`?tour&film=${n}`), 'aivh-tour-v1');
  assert.equal(key('?film=2'), 'aivh-show-v1');
  assert.equal(key('?tour&intro=1&film=2'), 'aivh-intro2-tour-v1');
});

function showContext(extra = {}) {
  const context = vm.createContext({
    SCEN: Array.from({length:6},(_,i)=>({id:i+1,ai:{d:"A"}})),
    S: id => id >= 1 && id <= 6,
    OPENER_PREVIEW:false, INTRO_PREVIEW:false,
    ...extra,
  });
  vm.runInContext(html.slice(html.indexOf("function freshRounds(){"),html.indexOf("let state = defaults();")),context);
  vm.runInContext("var state = defaults();",context);
  vm.runInContext(html.slice(html.indexOf("const v3Plan ="),html.indexOf("function cueLabel(")),context);
  return context;
}
const plain = value => JSON.parse(JSON.stringify(value));

test("new event plan has six single polls, external handoffs and CTA before Q&A", () => {
  const context = showContext();
  const cues = plain(context.buildCues());
  assert.equal(cues.length,54);
  assert.deepEqual(cues.slice(0,3).map(c=>c.t),["preshow","externalOpening","rules"]);
  assert.deepEqual(cues.slice(-6).map(c=>c.t),["interruption","collaboration","collaborationDiscussion","thanks","externalClosing","qa"]);
  assert.equal(cues.filter(c=>c.t==="poll").length,6);
  assert.ok(cues.filter(c=>c.t==="poll").every(c=>c.p===1));
  assert.ok(!cues.some(c=>["pivot","final","merge"].includes(c.t)));
  assert.equal(vm.runInContext("roundBudget()",context),600000);
  assert.equal(vm.runInContext("showMinutes()",context),85);
  context.state.config.media.opener={name:"saved-intro.mp4"};
  assert.deepEqual(plain(context.buildCues()),cues,"archived intro cannot replace Chris's external opener");
  context.state.config.media.vig6={name:"scenario-six.mp4"};
  const withFilm=plain(context.buildCues());
  assert.equal(withFilm.filter(c=>c.t==="video").length,1);
  assert.ok(withFilm.find(c=>c.t==="video").sid===6);
});

test("stored legacy sessions retain cue, clock, votes and legacy flow until explicit setup", () => {
  const context=showContext();
  const saved={v:1,cue:41,clock:{show:111,round:222,rsid:6},rounds:{6:{votes:{A:1,B:20,C:2,D:3},votes2:{A:30,B:2,C:1,D:0},judges:["HAI","AI","HAI","HAI"]}},config:{lineup:[1,2,3,4,5,6],pivotAfter:5,combined:[6],media:{vig1:{name:"retained.mp4",v:4}},sfx:true}};
  context.state=context.merge(saved);
  assert.equal(context.state.cue,saved.cue);
  assert.deepEqual(plain(context.state.clock),saved.clock);
  assert.deepEqual(plain(context.state.rounds[6].votes2),saved.rounds[6].votes2);
  assert.equal(context.state.config.showPlan,"legacy");
  const cues=plain(context.buildCues());
  assert.ok(cues.some(c=>c.t==="poll" && c.p===2));
  assert.ok(cues.some(c=>c.t==="pivot"));
  assert.equal(vm.runInContext("showMinutes()",context),75);
  assert.ok(!html.includes("AudioContext"),"saved sfx preferences cannot synthesize screen sounds");
});

test("explicit plan application refuses votes or a running clock and preserves saved media on clean setup", () => {
  let blocked=true, commits=0;
  const context=showContext({
    cleanSlate:()=>!blocked, renderOp(){}, commit(){commits++;},
    keepCue(change){change();},planMsg:"",pollingProvider:()=>"kahoot",
  });
  vm.runInContext(html.slice(html.indexOf("function applyOctoberPlan(){"),html.indexOf("const parseIds =")),context);
  context.state=context.merge({v:1,cue:0,clock:{show:123},rounds:{1:{votes:{A:3,B:1,C:0,D:0}}},config:{media:{vig1:{name:"kept.mp4",v:7,size:99}},pin:"1234567",ai:{1:{d:"D",c:50}},lineup:[1,2,3,4,5,6],combined:[6],pivotAfter:5}});
  const before=JSON.stringify(context.state);
  assert.equal(context.applyOctoberPlan(),false);
  assert.equal(JSON.stringify(context.state),before);
  assert.equal(commits,0);
  assert.match(context.planMsg,/Export.*Reset/);
  context.state.rounds=context.freshRounds();context.state.clock={show:null,round:null};blocked=false;
  const media=context.state.config.media, rounds=context.state.rounds, ai=context.state.config.ai;
  assert.equal(context.applyOctoberPlan(),true);
  assert.equal(context.state.config.media,media);
  assert.equal(context.state.rounds,rounds);
  assert.equal(context.state.config.ai,ai);
  assert.equal(context.state.config.pin,"");
  assert.deepEqual(plain(context.state.config.previousPolling),{provider:"kahoot",pin:"1234567",joinURL:""});
  assert.equal(context.state.config.showPlan,"oct14-v3");
  assert.equal(context.state.config.useChrisAI,true);
  assert.equal(commits,1);
});


test("October 6 tour URLs suffix storage, media and sync together without changing real-show namespaces", () => {
  const setup = html.slice(html.indexOf("const TOUR ="),html.indexOf("function freshRounds()"));
  const names = search => plain(vm.runInNewContext(setup + "\n({KEY,CHANNEL,MEDIA_DB})",{URLSearchParams,location:{search}}));
  const general={KEY:"aivh-tour-v1",CHANNEL:"aivh-tour",MEDIA_DB:"aivh-tour-media"};
  assert.deepEqual(names("?tour"),general);
  assert.deepEqual(names("?tour&revision=oct6"),Object.fromEntries(Object.entries(general).map(([key,value])=>[key,value+"-oct6"])));
  for (let n=1;n<=6;n++) {
    const expected={KEY:`aivh-film${n}-tour-v1`,CHANNEL:`aivh-film${n}-tour`,MEDIA_DB:`aivh-film${n}-tour-media`};
    assert.deepEqual(names(`?tour&film=${n}`),expected);
    assert.deepEqual(names(`?tour&film=${n}&revision=oct6`),Object.fromEntries(Object.entries(expected).map(([key,value])=>[key,value+"-oct6"])));
  }
  for (const [query,prefix] of [["intro=1","aivh-intro2-tour"],["opener=prototype","aivh-opener-tour"]]) {
    assert.deepEqual(names(`?tour&${query}&revision=oct6`),{KEY:prefix+"-v1-oct6",CHANNEL:prefix+"-oct6",MEDIA_DB:prefix+"-media-oct6"});
  }
  const show={KEY:"aivh-show-v1",CHANNEL:"aivh-show",MEDIA_DB:"aivh-media"};
  for (const query of ["","?revision=oct6","?film=1&revision=oct6","?opener=prototype&revision=oct6"]) assert.deepEqual(names(query),show);
  assert.deepEqual(names("?tour&revision=anything-else"),general);
});


test("final tour revision uses fresh namespaces while the initial October 6 revision and live show retain theirs", () => {
  const setup=html.slice(html.indexOf("const TOUR ="),html.indexOf("function freshRounds()"));
  const names=search=>plain(vm.runInNewContext(setup+"\n({KEY,CHANNEL,MEDIA_DB})",{URLSearchParams,location:{search}}));
  for (const selector of ["","&intro=1","&opener=prototype",...Array.from({length:6},(_,i)=>`&film=${i+1}`)]) {
    const base=names(`?tour${selector}`);
    const initial=names(`?tour${selector}&revision=oct6`);
    const final=names(`?tour${selector}&revision=oct6-final`);
    for (const field of ["KEY","CHANNEL","MEDIA_DB"]) {
      assert.equal(initial[field],base[field]+"-oct6");
      assert.equal(final[field],base[field]+"-oct6-final");
      assert.notEqual(final[field],initial[field]);
      assert.notEqual(final[field],base[field]);
    }
  }
  const show={KEY:"aivh-show-v1",CHANNEL:"aivh-show",MEDIA_DB:"aivh-media"};
  for (const query of ["?revision=oct6-final","?film=2&revision=oct6-final","?intro=1&revision=oct6-final"]) assert.deepEqual(names(query),show);
  assert.deepEqual(names("?tour&revision=oct6-final-other"),names("?tour"));
});

test("complete-film rehearsals isolate refined state, media and sync without moving legacy or live sessions", () => {
  const setup=html.slice(html.indexOf('const TOUR ='),html.indexOf('function freshRounds()'));
  const names=search=>JSON.parse(vm.runInNewContext(setup+'\nJSON.stringify({KEY,CHANNEL,MEDIA_DB})',{URLSearchParams,location:{search}}));
  assert.deepEqual(names("?tour&films=all&revision=refined"),{
    KEY:"aivh-fullfilms-tour-v1-refined",CHANNEL:"aivh-fullfilms-tour-refined",MEDIA_DB:"aivh-fullfilms-tour-media-refined",
  });
  const show={KEY:"aivh-show-v1",CHANNEL:"aivh-show",MEDIA_DB:"aivh-media"};
  assert.deepEqual(names("?films=all&revision=refined"),show);
  assert.deepEqual(names("?tour&films=all&revision=arena"),{
    KEY:"aivh-fullfilms-tour-v1-arena",CHANNEL:"aivh-fullfilms-tour-arena",MEDIA_DB:"aivh-fullfilms-tour-media-arena",
  });
  assert.deepEqual(names("?films=all&revision=arena"),show);
  assert.deepEqual(names("?tour&films=all&revision=story"),{
    KEY:"aivh-fullfilms-tour-v1-story",CHANNEL:"aivh-fullfilms-tour-story",MEDIA_DB:"aivh-fullfilms-tour-media-story",
  });
  assert.deepEqual(names("?films=all&revision=story"),show);
  assert.deepEqual(names("?tour"),{KEY:"aivh-tour-v1",CHANNEL:"aivh-tour",MEDIA_DB:"aivh-tour-media"});
  assert.deepEqual(names("?tour&film=2&films=all&revision=refined"),{
    KEY:"aivh-film2-tour-v1-refined",CHANNEL:"aivh-film2-tour-refined",MEDIA_DB:"aivh-film2-tour-media-refined",
  });
  assert.deepEqual(names("?tour&intro=1&films=all&revision=refined"),{
    KEY:"aivh-intro2-tour-v1-refined",CHANNEL:"aivh-intro2-tour-refined",MEDIA_DB:"aivh-intro2-tour-media-refined",
  });
});

test("Chris response selection refuses a running clock or votes and preserves custom replies/media on clean setup", () => {
  const make = (clock, votes) => {
    const context=vm.createContext({SCEN:[{id:1}],sum:v=>Object.values(v).reduce((n,v)=>n+v,0),state:{cue:0,clock:{show:clock},rounds:{1:{votes:{A:votes,B:0,C:0,D:0},votes2:{A:0,B:0,C:0,D:0},ov:null,ov2:null,judges:[null,null,null,null]}},config:{useChrisAI:false,ai:{2:{d:"A",c:22}},media:{vig1:{name:"saved.mp4"}}}},planMsg:"",renderOp(){},commit(){}});
    vm.runInContext(html.slice(html.indexOf("const cleanSlate ="),html.indexOf('let resetArmed')),context);
    vm.runInContext(html.slice(html.indexOf("function applyChrisAI(){"),html.indexOf("function applyOctoberPlan(){")),context);
    return context;
  };
  for(const blocked of [make(1000,0),make(null,12)]){
    const before=JSON.stringify(blocked.state);assert.equal(blocked.applyChrisAI(),false);assert.equal(JSON.stringify(blocked.state),before);assert.match(blocked.planMsg,/Export saved results/);
  }
  const clean=make(null,0);assert.equal(clean.applyChrisAI(),true);assert.equal(clean.state.config.useChrisAI,true);assert.equal(clean.state.config.ai[2].d,"A");assert.equal(clean.state.config.media.vig1.name,"saved.mp4");
});

test("final-response rehearsal separates its state, media and sync from previous tours and the live show",()=>{
  const setup=html.slice(html.indexOf('const TOUR ='),html.indexOf('function freshRounds()'));
  const names=search=>JSON.parse(vm.runInNewContext(setup+'\nJSON.stringify({KEY,CHANNEL,MEDIA_DB})',{URLSearchParams,location:{search}}));
  assert.deepEqual(names("?tour&films=all&revision=oct9-ai"),{KEY:"aivh-fullfilms-tour-v1-oct9-ai",CHANNEL:"aivh-fullfilms-tour-oct9-ai",MEDIA_DB:"aivh-fullfilms-tour-media-oct9-ai"});
  assert.notDeepEqual(names("?tour&films=all&revision=oct9-ai"),names("?tour&films=all&revision=oct9"));
  assert.deepEqual(names("?revision=oct9-ai"),{KEY:"aivh-show-v1",CHANNEL:"aivh-show",MEDIA_DB:"aivh-media"});
});

test("paced vendor rehearsal isolates media and sync from previous tours and the live show", () => {
  const setup=html.slice(html.indexOf('const TOUR ='),html.indexOf('function freshRounds()'));
  const names=search=>JSON.parse(vm.runInNewContext(setup+'\nJSON.stringify({KEY,CHANNEL,MEDIA_DB})',{URLSearchParams,location:{search}}));
  assert.deepEqual(names("?tour&film=4&revision=oct11-chat"),{KEY:"aivh-film4-tour-v1-oct11-chat",CHANNEL:"aivh-film4-tour-oct11-chat",MEDIA_DB:"aivh-film4-tour-media-oct11-chat"});
  assert.deepEqual(names("?tour&films=all&revision=oct11-chat"),{KEY:"aivh-fullfilms-tour-v1-oct11-chat",CHANNEL:"aivh-fullfilms-tour-oct11-chat",MEDIA_DB:"aivh-fullfilms-tour-media-oct11-chat"});
  assert.notDeepEqual(names("?tour&film=4&revision=oct11-chat"),names("?tour&film=4&revision=oct9-ai"));
  assert.deepEqual(names("?revision=oct11-chat"),{KEY:"aivh-show-v1",CHANNEL:"aivh-show",MEDIA_DB:"aivh-media"});
});

test("latest timing keeps ten-minute rounds and preserves saved97-minute shows", () => {
  const context = showContext();
  assert.equal(vm.runInContext("showMinutes()",context),85);
  assert.equal(vm.runInContext("qaMinutes()",context),20);
  assert.equal(vm.runInContext("roundBudget()",context),600000);
  const saved={v:1,cue:4,clock:{show:1000,round:2000},rounds:{1:{votes:{A:3,B:7,C:0,D:0}}},config:{showPlan:"oct14-feedback",media:{vig4:{name:"kept.mp4",v:1}},ai:{1:{d:"D",c:40}}}};
  context.state=context.merge(saved);
  assert.equal(vm.runInContext("showMinutes()",context),97);
  assert.equal(vm.runInContext("qaMinutes()",context),15);
  assert.deepEqual(plain(context.state.clock),saved.clock);
  assert.deepEqual(plain(context.state.config.media),saved.config.media);
  assert.deepEqual(plain(context.state.rounds[1].votes),saved.rounds[1].votes);
});

test("Q&A uses its own budget while the main-show clock holds at the handoff", () => {
  const context=showContext();
  vm.runInContext(html.slice(html.indexOf("const mmss ="),html.indexOf("/* ---------- timers ---------- */")),context);
  context.cues=[{t:"qa"}];context.state.cue=0;
  context.state.clock={show:1000,round:null,qa:1000+85*60000};
  const qa=context.state.clock.qa;
  assert.match(context.clockHTML(qa+3*60000),/Show <b>1:25:00<\/b> of 85:00/);
  assert.match(context.clockHTML(qa+3*60000),/Q&amp;A <b>3:00<\/b> of 20:00/);
  assert.equal((context.clockHTML(qa+21*60000).match(/class="over"/g)||[]).length,1);
  context.state.clock={show:null,round:null};
  assert.match(context.clockHTML(qa),/starts on opening GO/);
});

test("ready rehearsal isolates the latest show from paced-chat and real-show sessions", () => {
  const setup=html.slice(html.indexOf('const TOUR ='),html.indexOf('function freshRounds()'));
  const names=search=>JSON.parse(vm.runInNewContext(setup+'\nJSON.stringify({KEY,CHANNEL,MEDIA_DB})',{URLSearchParams,location:{search}}));
  assert.deepEqual(names("?tour&films=all&revision=oct11-ready"),{KEY:"aivh-fullfilms-tour-v1-oct11-ready",CHANNEL:"aivh-fullfilms-tour-oct11-ready",MEDIA_DB:"aivh-fullfilms-tour-media-oct11-ready"});
  assert.notDeepEqual(names("?tour&films=all&revision=oct11-ready"),names("?tour&films=all&revision=oct11-chat"));
  assert.deepEqual(names("?revision=oct11-ready"),{KEY:"aivh-show-v1",CHANNEL:"aivh-show",MEDIA_DB:"aivh-media"});
});


test("final polish rehearsal isolates all film namespaces from v3 and live sessions", () => {
  const setup=html.slice(html.indexOf("const TOUR ="),html.indexOf("function freshRounds()"));
  const names=search=>plain(vm.runInNewContext(setup+"\n({KEY,CHANNEL,MEDIA_DB})",{URLSearchParams,location:{search}}));
  for(const revision of ["oct13-final","oct14-chat"]) for(const query of ["?tour","?tour&films=all",...Array.from({length:6},(_,i)=>`?tour&film=${i+1}`)]) {
    const prior=names(query+"&revision=oct13-v3"),final=names(query+"&revision="+revision);
    for(const k of ["KEY","CHANNEL","MEDIA_DB"]) {
      assert.equal(final[k],prior[k].replace(/-oct13-v3$/,"-"+revision));
      assert.notEqual(final[k],prior[k]);
    }
  }
  assert.deepEqual(names("?revision=oct14-chat"),names(""));
});
