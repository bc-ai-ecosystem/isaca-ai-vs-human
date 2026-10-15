import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
function configContext(){
  const context = vm.createContext({SCEN:Array.from({length:6},(_,i)=>({id:i+1})),S:id=>id>=1&&id<=6});
  vm.runInContext(html.slice(html.indexOf("function freshRounds(){"),html.indexOf("let state = defaults();")),context);
  return context;
}

test("community polling starts unbound while saved Kahoot configuration keeps its provider",()=>{
  const context=configContext(),fresh=context.defaults();
  assert.equal(fresh.config.pollingProvider,"slido");
  assert.equal(fresh.config.pin,"");
  assert.equal(fresh.config.pollingJoinURL,"");
  const saved={v:1,cue:9,config:{pin:"7654321",media:{vig1:{v:4,name:"chosen.mp4"}},ai:{1:{d:"D",c:40}}},rounds:{1:{votes:{A:0,B:2,C:0,D:0}}}};
  const merged=context.merge(saved);
  assert.equal(merged.config.pollingProvider,"kahoot");
  assert.equal(merged.config.pollingJoinURL,"");
  assert.equal(merged.config.pin,"7654321");
  assert.equal(merged.cue,9);
  assert.deepEqual(plain(merged.config.media),saved.config.media);
  assert.deepEqual(plain(merged.rounds[1].votes),saved.rounds[1].votes);
});

function joinContext(hostname="isaca.example"){
  const context=vm.createContext({URL,state:{config:{pin:"1234 567",pollingProvider:"slido",pollingJoinURL:"https://qr.sli.do/example-community-event"}},location:{hostname,protocol:"https:",href:`https://${hostname}/?tour`}});
  vm.runInContext(html.slice(html.indexOf("const pollingProvider ="),html.indexOf("let qrLib = null;")),context);
  return context;
}

test("Slido QR matches the supplied direct event link on public and loopback origins",()=>{
  const context=joinContext();
  assert.equal(context.joinURL(),"https://qr.sli.do/example-community-event");
  assert.equal(vm.runInContext("pollingCode()",context),"1234 567");
  assert.equal(joinContext("127.0.0.1").joinURL(),"https://qr.sli.do/example-community-event");
  context.state.config.pollingProvider="kahoot";
  assert.equal(new URL(context.joinURL()).searchParams.get("provider"),"kahoot");
  assert.equal(context.pollingDestination(),"https://kahoot.it/?pin=1234567");
});

test("an untrusted participant link cannot redirect the phone QR away from Slido",()=>{
  const context=joinContext();
  for(const url of ["javascript:alert(1)","https://evil.example/","https://qr.sli.do.evil.example/","https://user:password@qr.sli.do/event","http://qr.sli.do/event"]){
    assert.equal(context.validPollingJoinURL(url),false,url);
    context.state.config.pollingJoinURL=url;
    assert.equal(context.pollingDestination(),"https://www.slido.com/");
  }
});

function showContext(extra={}){
  const context=vm.createContext({OPENER_PREVIEW:false,INTRO_PREVIEW:false,commit(){},...extra});
  vm.runInContext(html.slice(html.indexOf('const SCEN ='),html.indexOf('const pollingProvider =')),context);
  vm.runInContext(html.slice(html.indexOf('function freshRounds(){'),html.indexOf('let state = defaults();')),context);
  vm.runInContext('var state=defaults();',context);
  vm.runInContext(html.slice(html.indexOf('const v3Plan ='),html.indexOf('const DIGITS =')),context);
  vm.runInContext('var cues=buildCues();',context);
  return context;
}

test('v3 has five scorecards and judged rounds, six polls, and a manual unscored finale',()=>{
  const c=showContext(),cues=plain(c.buildCues());
  assert.equal(cues.length,54);
  assert.deepEqual(cues.filter(x=>x.t==='scorecard').map(x=>x.sid),[2,3,4,5,6]);
  assert.deepEqual(cues.filter(x=>x.t==='judges').map(x=>x.sid),[1,2,3,4,5]);
  assert.deepEqual(cues.filter(x=>x.t==='debate').map(x=>x.sid),[1,2,3,4,5]);
  assert.equal(cues.filter(x=>x.t==='poll').length,6);
  assert.deepEqual(cues.slice(-6).map(x=>x.t),['interruption','collaboration','collaborationDiscussion','thanks','externalClosing','qa']);
  for(let n=1;n<=6;n++)c.state.config.media[`vig${n}`]={name:'chosen.mp4'};
  assert.equal(c.buildCues().length,60);
  c.state.config.showPlan='oct14-feedback';
  assert.equal(c.buildCues().length,54,'explicit earlier six-scored plan keeps its cue count');
  assert.equal(c.buildCues().filter(x=>x.t==='judges').length,6);
});

test('matching choices and 2-2 draws count in rounds1-5, but scenario6 never scores',()=>{
  const c=showContext();
  c.state.rounds[1].votes.B=2;
  assert.equal(c.result(1,true).why,'same');
  c.state.rounds[2].votes.A=2;c.state.rounds[2].judges=['H','AI','H','AI'];
  assert.equal(c.result(2,true).why,'split');
  c.state.rounds[3].votes.A=2;c.state.rounds[3].judges=['H','H','AI','H'];c.state.rounds[3].revealed=true;
  assert.equal(c.result(3,true).winner,'H');
  c.state.rounds[6].votes.C=2;c.state.rounds[6].judges=['AI','AI','AI','AI'];
  assert.equal(c.result(6,true).state,'unscored');
  assert.equal(c.result(6,true).winner,undefined);
  c.state.cue=c.cues.findIndex(x=>x.t==='scorecard'&&x.sid===4);
  assert.deepEqual(plain(c.scores()),{H:1,AI:0,HAI:0,draw:2});
  c.state.cue=c.cues.findIndex(x=>x.t==='ai'&&x.sid===3);
  assert.deepEqual(plain(c.scores()),{H:0,AI:0,HAI:0,draw:2},'back before judging rewinds its point');
  c.state.cue=c.cues.length-1;
  assert.deepEqual(plain(c.scores()),{H:1,AI:0,HAI:0,draw:2});
  c.state.config.showPlan='oct14-feedback';
  assert.equal(c.result(6,true).why,'same','historical six-scored show is preserved');
});

test('current stage uses source-labelled edited reasoning without replacing original model replies or custom overrides',()=>{
  const c=showContext();
  const approved=JSON.parse(readFileSync(new URL('../production-drafts/ai/chris-oct14-stage-copy.json',import.meta.url),'utf8'));
  for(let n=1;n<=6;n++){
    const answer=vm.runInContext(`aiOf(S(${n}))`,c),expected=approved[n];
    assert.equal(answer.d,expected.decision);assert.equal(answer.c,expected.confidence);
    assert.deepEqual(plain(answer.reasoning),expected.reasoning);assert.equal(answer.conclusion,expected.conclusion);
    assert.ok(answer.original,'full original response remains available to the operator');
  }
  c.state.config.ai[4]={d:'A',c:52,why:'custom source'};
  assert.deepEqual(plain(vm.runInContext('aiOf(S(4))',c)),c.state.config.ai[4]);
  c.state.config.showPlan='oct14-feedback';
  assert.equal(vm.runInContext('aiOf(S(1)).reasoning',c),undefined);
});

test('export includes all six audience decisions and explicitly blanks round-six judges',()=>{
  const c=showContext();
  vm.runInContext('const sum=v=>K.reduce((a,k)=>a+(+v[k]||0),0);const pct=(n,t)=>t?Math.round(n*100/t):0;',c);
  vm.runInContext(html.slice(html.indexOf('function resultsText(){'),html.indexOf('function kahootSheet(){')),c);
  for(let n=1;n<=6;n++){c.state.rounds[n].votes.A=1;c.state.rounds[n].judges=['H','H','H','H'];}
  const exported=c.resultsText(),r6=exported.split('\n').find(line=>line.startsWith('| 6 |'));
  assert.match(r6,/A \(100%\).*Grok · C \(68%\) \|  \| Unscored closing discussion/);
  assert.match(exported,/Final: Humans 5, AI 0, 0 drawn/);
});

test('inspection never starts the show; scorecard starts a round once and interruption freezes round6',()=>{
  let now=100000;
  class ClockDate extends Date {static now(){return now;}}
  const c=showContext({Date:ClockDate});
  vm.runInContext(html.slice(html.indexOf('function setCue('),html.indexOf('function missing(')),c);
  const jump=(type,sid,opening=false)=>c.setCue(c.cues.findIndex(x=>x.t===type&&(!sid||x.sid===sid)),opening);
  jump('round',1);assert.equal(c.state.clock.show,null);assert.equal(c.state.clock.round,null);
  jump('externalOpening',null,true);assert.equal(c.state.clock.show,now);
  now+=5000;jump('round',1);assert.equal(c.state.clock.round,now);
  now+=10000;jump('scorecard',2);const start=c.state.clock.round;
  now+=3000;jump('round',2);assert.equal(c.state.clock.round,start);
  now+=20000;jump('scorecard',6);const r6=c.state.clock.round;
  now+=50000;jump('interruption',6);const stop=c.state.clock.roundEnd;
  assert.equal(stop-r6,50000);
  now+=5000;jump('collaboration',6);assert.equal(c.state.clock.roundEnd,stop);
});
