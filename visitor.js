const main = document.querySelector("#main");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const number = id => String(id).padStart(2, "0");
const minutes = seconds => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
let scenarios = [], answers = {}, storageAvailable = true, pendingReset = null;
const progressKey = "aivh-visitor-v1";
const dialog = document.querySelector("#reset-dialog");

try {
  const raw = localStorage.getItem(progressKey);
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      if (saved.version === 1 && saved.answers && typeof saved.answers === "object" && !Array.isArray(saved.answers)) {
        answers = Object.fromEntries(Object.entries(saved.answers).filter(([id, choice]) => /^[1-6]$/.test(id) && typeof choice === "string" && /^[A-D]$/.test(choice)));
      }
    } catch {}
  }
} catch { storageAvailable = false; }

function saveProgress() {
  try { localStorage.setItem(progressKey, JSON.stringify({version: 1, answers})); }
  catch { storageAvailable = false; }
}

const choiceOf = (s, letter) => s.choices.find(c => c.letter === letter);
const backLink = `<a class="back-link" href="#scenarios">← All six scenarios</a>`;
function incident(s) {
  return `<div class="page">${backLink}
    <div class="steps"><b>01 Watch or read</b><span>02 Your call</span><span>03 Compare</span></div>
    <header class="file-head"><p class="eyebrow">Incident file ${number(s.id)} · ${esc(s.themes.join(" / "))}</p><h1>${esc(s.title)}</h1><p class="lede">${esc(s.tension)}</p></header>
    <div class="watch-layout"><div><div class="film-frame" id="film-frame"><img src="${esc(s.media.poster)}" alt="Still from the fictional scenario film" width="1280" height="720"><button class="button primary" type="button" data-watch="${s.id}">▶ Watch the film · ${minutes(s.media.seconds)}</button></div><p class="film-status" id="film-status" role="status"></p></div>
      <div class="watch-notes"><h2>The clock is part of the story.<br>Take your time here.</h2><p>Watch the scene, or read the complete incident. You have the same evidence as the prepared AI response.</p><button class="button" type="button" data-read>Read instead</button><p class="small">Fictional incident · generated performances<br>Captions available in the player.</p></div>
    </div>
    <details class="briefing" id="incident-brief"><summary>Read the full incident and evidence</summary><div class="brief-copy"><h2 tabindex="-1" id="brief-heading">Incident briefing</h2>
      ${s.brief.map(p => p.startsWith("q:") ? `<blockquote>${esc(p.slice(2))}</blockquote>` : `<p>${esc(p)}</p>`).join("")}
      <dl class="facts">${s.facts.map(([label, value, tone]) => `<div><dt>${esc(label)}</dt><dd data-tone="${esc(tone)}">${esc(value)}</dd></div>`).join("")}</dl>
    </div></details>
    ${answers[s.id] ? `<div class="actions"><a class="button primary" href="#scenario-${s.id}/compare">Return to your comparison</a></div>` : `<form class="choice-form" data-scenario="${s.id}"><fieldset><legend>${esc(s.question)}</legend><p class="choice-help">Choose one response. Commit your call before seeing the prepared AI analysis.</p><div class="choice-list">
      ${s.choices.map(c => `<label class="choice"><input type="radio" name="decision" value="${c.letter}" required><span class="letter">${c.letter}</span><span><strong>${esc(c.title)}</strong><span class="detail">${esc(c.detail)}</span></span></label>`).join("")}
    </div></fieldset><div class="actions"><button class="button primary" type="submit" disabled>Compare my call</button><p class="privacy-note">Your choice stays in this browser. It isn’t submitted to a live poll.</p></div></form>`}
  </div>`;
}

function comparison(s) {
  const yours = choiceOf(s, answers[s.id]), ai = choiceOf(s, s.ai.decision);
  return `<div class="page">${backLink}<div class="steps"><span>01 Watch or read</span><span>02 Your call</span><b>03 Compare</b></div>
    <header class="file-head"><p class="eyebrow">File ${number(s.id)} · ${esc(s.title)}</p><h1>Two calls. Same evidence.</h1><p class="comparison-note">${yours.letter === ai.letter ? "You chose the same option." : "You chose differently."} The reasoning deserves a closer look either way.</p></header>
    <div class="comparison-grid"><section class="call-card" aria-label="Your decision"><h2>Your call</h2><div class="decision-letter" data-your-choice>${yours.letter}</div><h3>${esc(yours.title)}</h3><p>${esc(yours.detail)}</p></section>
    <section class="call-card ai-card" aria-label="Prepared AI decision"><h2 class="provider"><img src="media/ai-provider-${s.ai.provider.toLowerCase()}.${s.ai.provider === "Claude" ? "png" : "svg"}" alt="">${esc(s.ai.provider)} · prepared AI call</h2><div class="decision-letter" data-ai-choice>${ai.letter}</div><h3>${esc(ai.title)}</h3>
      <span class="confidence">${s.ai.confidence}% stated response confidence</span><ul>${s.ai.reasoning.map(r => `<li>${esc(r)}</li>`).join("")}</ul><p><strong>${esc(s.ai.conclusion)}</strong></p>
      <p class="source-note">${esc(s.ai.provenance)}<br><br>This confidence is the response’s stated confidence, not a measured probability or a security verdict. Any compromise estimate inside the incident is a separate claim.</p>
    </section></div>
    <section class="reflection"><p class="eyebrow">Stay with the difficult part.</p><h2>What would change your mind?</h2><p class="debate">${esc(s.discussion)}</p><details><summary>Explore the tradeoffs in all four options</summary><p>${esc(s.tradeoffs)}</p></details>
      <div class="actions"><a class="button primary" href="#scenario-${s.id % 6 + 1}">Try another scenario →</a><a class="button" href="#summary">See your calls</a><a class="text-link" href="#scenario-${s.id}/watch">Replay the film or read again</a><button class="text-button" type="button" data-reset="${s.id}">Make this decision again</button></div>
    </section></div>`;
}

function summary() {
  const completed = scenarios.filter(s => answers[s.id]);
  const matched = completed.filter(s => answers[s.id] === s.ai.decision).length;
  return `<div class="page summary-page">${backLink}<header class="file-head"><p class="eyebrow">Your decisions · ${storageAvailable ? "saved on this device" : "for this tab"}</p><h1>Your calls.</h1><p class="lede">${completed.length} of 6 incidents explored. ${completed.length ? `${matched} choices matched the prepared AI option. The reasoning matters more than the match.` : "Your first call is still ahead. Start with any incident."}</p></header>
    ${completed.length ? `<div class="summary-list">${completed.map(s => `<section class="summary-row" data-summary-row><div><p class="eyebrow">File ${number(s.id)}</p><h2>${esc(s.title)}</h2><p>${esc(s.themes.join(" / "))}</p></div><div class="summary-decisions"><span>Your call <strong>${answers[s.id]}</strong></span><span>${esc(s.ai.provider)} <strong>${s.ai.decision}</strong></span></div><a class="button" href="#scenario-${s.id}/compare">Review this call →</a></section>`).join("")}</div>
    <section class="reflection"><h2>Human + AI. Keep asking.</h2><p class="lede">The live show brought cybersecurity professionals into the conversation. Here, the next step is yours: ask someone else to make a call, compare your assumptions, and question the model’s reasoning together.</p><p class="small">These are your choices alone. Matching a prepared answer does not establish correctness or professional competence.</p></section>
    <div class="actions"><button class="button" type="button" data-print>Print my summary</button><button class="text-button" type="button" data-reset="all">Clear my progress</button></div>` : `<div class="actions"><a class="button primary" href="#scenario-1">Make your first call →</a></div>`}
  </div>`;
}

function about() {
  return `<article class="page about-page">${backLink}
    <header class="file-head"><p class="eyebrow">BC + AI × ISACA Vancouver · October 14, 2026</p><h1>From stage to browser.</h1><p class="lede">Six incidents built for a room full of people. Now you can make the calls yourself.</p></header>
    <div class="about-copy"><p>ISACA Vancouver brought <strong>AI vs. Human: An Interactive Cyber Awareness Experience</strong> to the Annex in Vancouver, in partnership with BC + AI. Kris Krüg built the showrunner and developed the scenario-film production with AI-assisted tools.</p><p>The stage format put audience decisions beside prepared model responses, with Cyber Judges examining the reasoning. This visitor edition gives you the incident evidence, time to make a choice, and a way to question the analysis.</p></div>
    <figure class="documentary"><img src="media/visitor-event-night.png" alt="Group selfie at AI vs. Human, with red theatre seating and the audience behind" width="1600" height="900" loading="lazy" decoding="async"><figcaption>BC + AI members Natasha, David, Fiann, and Martin at AI vs. Human. Colin is lurking in the background.</figcaption></figure>
    <div class="about-copy"><h2>Built for the room.</h2><p>Chris Shachtay and Nathan Chan shaped the production and show flow with Kris. Vipin supported operator delivery, with Levi supporting the venue technical route. The stage app gives the operator a separate view, deliberate film holds, incident briefings, and results export.</p><p>The prep work included slowing down a vendor-chat sequence so people could read it, simplifying debate screens, and checking the films in the show itself.</p></div>
    <figure class="documentary"><img src="media/visitor-prep-sessions.png" alt="Three-panel collage of people rehearsing with laptops and a projected show screen, plus a close view of the production desk" width="1536" height="1024" loading="lazy" decoding="async"><figcaption>Prep sessions for AI vs. Human: rehearsing the showrunner, scenario films, and projector setup.</figcaption></figure>
    <div class="about-copy"><h2>The people behind it.</h2><p>Chris Shachtay was the MC. The Cyber Judges were Penny Longman, Larry Carson, Jeffrey Ten Eyck, and Shashi Gautam. SOCRadar and Gigamon were the presenting sponsors. ISACA Vancouver supplied the event direction, scenarios, and cybersecurity review.</p><p><a href="https://luma.com/q5ifj88x">See the official event listing and contributor details ↗</a></p>
    <h2>Question the answer.</h2><p>The model responses are prepared show material, with edited stage reasoning. They are not live model calls or a scientific benchmark. Stated confidence is not a calibrated probability. The incidents and generated film performances are fictional; the photographs above document the event and preparation.</p><p>Your committed choices are stored in this browser only. This edition has no account, public leaderboard, or connection to the event’s phone voting. If browser storage is blocked, you can still play in the current tab.</p><p>The code is shared for inspection. Films, voices, artwork, and third-party marks have separate rights; viewing this experience does not grant a general reuse licence.</p>
    <div class="actions"><a class="button primary" href="#scenario-1">Make your first call →</a><a class="button" href="https://github.com/bc-ai-ecosystem/isaca-ai-vs-human">Explore the source ↗</a></div></div>
  </article>`;
}

function watchFilm(id) {
  const s = scenarios.find(s => s.id === Number(id));
  if (!s) return;
  const frame = document.querySelector("#film-frame"), status = document.querySelector("#film-status");
  const video = document.createElement("video");
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.poster = s.media.poster;
  video.setAttribute("aria-label", `${s.title} scenario film`);
  const captions = document.createElement("track");
  Object.assign(captions, {kind: "captions", srclang: "en", label: "English", src: s.media.captions, default: true});
  video.append(captions);
  video.addEventListener("error", () => {
    status.textContent = "The film couldn’t load. The full incident is below; you can still make your call.";
    const retry = document.createElement("button");
    retry.type = "button"; retry.className = "button"; retry.dataset.watch = s.id;
    retry.textContent = "Try loading the film again";
    frame.append(retry);
  }, {once: true});
  status.textContent = "";
  frame.replaceChildren(video);
  video.src = s.media.src;
  video.play().catch(error => {
    if (!video.error && error.name !== "AbortError") status.textContent = "Press play in the player to start the film.";
  });
  video.focus();
}

function home() {
  const first = scenarios[0];
  return `<div class="hero">
    <div><p class="eyebrow">BC + AI × ISACA Vancouver · The visitor edition</p>
      <h1>A cyber incident.<br>Four choices.<br><em>Your call.</em></h1>
      <p class="lede">The face looks familiar. The request sounds urgent. A quarter-million dollars is about to leave the account. What do you check first?</p>
      <div class="actions"><a class="button primary" href="#scenario-1">Start with the $250K transfer <span aria-hidden="true">↗</span></a><a class="text-link" href="#scenarios">Choose a scenario ↓</a></div>
      <p class="small" style="margin-top:18px">Watch or read. Make your decision. Then see the AI’s reasoning. No timer.</p>
    </div>
    <figure class="hero-visual"><img src="${esc(first.media.poster)}" alt="Fictional CEO appearing on a laptop video call" width="1280" height="720">
      <figcaption><span class="eyebrow">Incident file 01 · ${minutes(first.media.seconds)} film</span><strong>The $250K Transfer</strong>“We need the deposit transferred within the next 30 minutes.”</figcaption>
    </figure>
  </div>
  <section class="section" id="scenarios" aria-labelledby="scenarios-heading">
    <div class="section-head"><h2 id="scenarios-heading">Pick your pressure.</h2><p>Six fictional incidents. Start anywhere.</p></div>
    <div class="scenario-grid">${scenarios.map(s => `<a class="scenario-link" href="#scenario-${s.id}">
      <div class="poster"><img src="${esc(s.media.poster)}" alt="" width="1280" height="720" loading="lazy"></div>
      <span class="number">FILE ${number(s.id)} · ${minutes(s.media.seconds)} FILM</span><h3>${esc(s.title)}</h3><p>${esc(s.tension)}</p>
    </a>`).join("")}</div>
  </section>`;
}

function render(focus = false) {
  if (!scenarios.length) return;
  const previousFilm = main.querySelector("video");
  if (previousFilm) {
    previousFilm.pause();
    previousFilm.removeAttribute("src");
    previousFilm.load();
  }
  const route = location.hash.match(/^#scenario-([1-6])(?:\/(compare|watch))?$/);
  const s = route && scenarios.find(s => s.id === Number(route[1]));
  main.innerHTML = s ? answers[s.id] && route[2] !== "watch" ? comparison(s) : incident(s) : location.hash === "#summary" ? summary() : location.hash === "#about" ? about() : home();
  const notice = document.querySelector("#storage-notice");
  notice.hidden = storageAvailable;
  notice.textContent = storageAvailable ? "" : "Browser storage is unavailable. Your progress lasts for this tab; reloading will clear it.";
  main.classList.remove("enter");
  requestAnimationFrame(() => {
    main.classList.add("enter");
    if (location.hash === "#scenarios") document.querySelector("#scenarios")?.scrollIntoView();
    else if (focus) { window.scrollTo(0, 0); const h = main.querySelector("h1"); h.tabIndex = -1; h.focus({preventScroll: true}); }
  });
}

addEventListener("hashchange", () => render(true));
document.querySelector(".skip-link").addEventListener("click", event => {
  event.preventDefault();
  main.focus();
  main.scrollIntoView();
});
main.addEventListener("change", event => {
  if (event.target.matches('input[name="decision"]')) event.target.closest("form").querySelector('[type="submit"]').disabled = false;
});
main.addEventListener("submit", event => {
  if (!event.target.matches(".choice-form")) return;
  event.preventDefault();
  const id = Number(event.target.dataset.scenario), choice = new FormData(event.target).get("decision");
  if (!scenarios.some(s => s.id === id) || !/^[A-D]$/.test(choice)) return;
  answers[id] = choice;
  saveProgress();
  location.hash = `scenario-${id}/compare`;
});
main.addEventListener("click", event => {
  const reset = event.target.closest("[data-reset]");
  if (reset) {
    pendingReset = reset.dataset.reset;
    document.querySelector("#reset-title").textContent = pendingReset === "all" ? "Clear your decisions?" : "Revisit this decision?";
    document.querySelector("#reset-description").textContent = pendingReset === "all" ? "This clears your visitor choices on this device. You can then start fresh." : "This clears this incident’s committed choice. Your other decisions stay saved.";
    dialog.showModal();
  }
  if (event.target.closest("[data-print]")) window.print();
  const watch = event.target.closest("[data-watch]");
  if (watch) watchFilm(watch.dataset.watch);
  if (event.target.closest("[data-read]")) {
    document.querySelector("#incident-brief").open = true;
    document.querySelector("#brief-heading").focus();
  }
});
document.querySelector("[data-cancel-reset]").addEventListener("click", () => {pendingReset = null; dialog.close();});
dialog.addEventListener("cancel", () => {pendingReset = null;});
document.querySelector("[data-confirm-reset]").addEventListener("click", () => {
  const target = pendingReset;
  if (target === "all") answers = {};
  else if (/^[1-6]$/.test(target)) delete answers[target];
  else return;
  saveProgress();
  pendingReset = null;
  dialog.close();
  if (target === "all") render(true);
  else location.hash = `scenario-${target}`;
});

try {
  const response = await fetch("media/visitor-scenarios.json");
  if (!response.ok) throw new Error("Catalogue unavailable");
  const data = await response.json();
  const mediaPath = /^media\/[a-zA-Z0-9.-]+$/;
  if (data.version !== 1 || !Array.isArray(data.scenarios) || data.scenarios.length !== 6 ||
      !data.scenarios.every((s, i) => s.id === i + 1 && typeof s.title === "string" &&
        Array.isArray(s.themes) && s.themes.every(t => typeof t === "string") &&
        [s.tension, s.question, s.tradeoffs, s.discussion].every(text => typeof text === "string") &&
        Array.isArray(s.brief) && s.brief.every(p => typeof p === "string") &&
        Array.isArray(s.facts) && s.facts.every(f => Array.isArray(f) && f.length === 3 && f.every(v => typeof v === "string")) &&
        Array.isArray(s.choices) && s.choices.length === 4 &&
        s.choices.every((c, index) => c.letter === "ABCD"[index] && typeof c.title === "string" && typeof c.detail === "string") &&
        ["ChatGPT", "Claude", "Grok"].includes(s.ai?.provider) && /^[A-D]$/.test(s.ai.decision) &&
        Number.isFinite(s.ai.confidence) && s.ai.confidence >= 0 && s.ai.confidence <= 100 &&
        [s.ai.provenance, s.ai.conclusion].every(text => typeof text === "string") &&
        Array.isArray(s.ai.reasoning) && s.ai.reasoning.every(r => typeof r === "string") &&
        Number.isFinite(s.media?.seconds) && s.media.seconds > 0 &&
        [s.media?.src, s.media?.poster, s.media?.captions].every(path => typeof path === "string" && mediaPath.test(path)))) {
    throw new Error("Invalid catalogue");
  }
  scenarios = data.scenarios;
  render();
} catch {
  main.innerHTML = `<div class="error-panel" role="alert"><h1>The incident files couldn’t load.</h1><p>Try reloading, or watch the released films directly.</p><a class="button" href="play.html">Try again</a> <a class="button" href="review.html">Watch the films</a></div>`;
}
