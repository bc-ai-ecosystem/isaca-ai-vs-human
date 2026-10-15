const main = document.querySelector("#main");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const number = id => String(id).padStart(2, "0");
const minutes = seconds => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
let scenarios = [];

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

function render() {
  main.innerHTML = home();
  main.classList.remove("enter");
  requestAnimationFrame(() => main.classList.add("enter"));
}

try {
  const response = await fetch("media/visitor-scenarios.json");
  if (!response.ok) throw new Error("Catalogue unavailable");
  const data = await response.json();
  if (data.version !== 1 || data.scenarios?.length !== 6) throw new Error("Invalid catalogue");
  scenarios = data.scenarios;
  render();
} catch {
  main.innerHTML = `<div class="error-panel" role="alert"><h1>The incident files couldn’t load.</h1><p>Try reloading, or watch the released films directly.</p><a class="button" href="play.html">Try again</a> <a class="button" href="review.html">Watch the films</a></div>`;
}
