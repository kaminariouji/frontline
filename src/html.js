export const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frontline — a board game for people and agents</title>
<style>
  :root { --bg:#12100e; --paper:#f4ece0; --ink:#2c1f1a; --pink:#e74079; --green:#10542e; --blue:#1f6fb2; --line:#3a2f28; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--paper); font:16px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { padding:22px 20px 6px; max-width:760px; margin:0 auto; }
  h1 { margin:0; font-size:26px; letter-spacing:.02em; }
  h1 span { color:var(--pink); }
  .sub { color:#a89c8e; font-size:14px; margin-top:6px; }
  main { max-width:760px; margin:0 auto; padding:12px 20px 60px; }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  input, button, select { font:inherit; border-radius:8px; border:1px solid var(--line); background:#1b1714; color:var(--paper); padding:9px 12px; }
  button { cursor:pointer; background:#241d19; }
  button:hover { background:#2e251f; }
  button.primary { background:var(--pink); border-color:var(--pink); color:#fff; font-weight:600; }
  button.primary:hover { filter:brightness(1.08); }
  button.on { background:var(--green); border-color:var(--green); color:#fff; }
  #board { display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; margin:18px 0; aspect-ratio:1/1; max-width:520px; }
  .cell { position:relative; border-radius:8px; background:#1b1714; border:1px solid #2b231e; display:flex; align-items:center; justify-content:center; cursor:default; transition:background .12s; }
  .cell.legal { background:#242d26; border-color:#3d5a45; cursor:pointer; }
  .cell.legal:hover { background:#2c3a30; }
  .stone { width:74%; height:74%; border-radius:50%; box-shadow:inset 0 -3px 0 rgba(0,0,0,.25); }
  .wall { width:78%; height:78%; border-radius:5px; background:repeating-linear-gradient(45deg,#6b5c4d,#6b5c4d 6px,#574a3e 6px,#574a3e 12px); }
  .cell .idx { position:absolute; font-size:10px; color:#5d5045; bottom:3px; right:5px; }
  .bar { display:flex; gap:8px; flex-wrap:wrap; margin-top:6px; }
  .pill { border:1px solid var(--line); border-radius:999px; padding:5px 11px; font-size:13px; display:flex; gap:7px; align-items:center; }
  .dot { width:11px; height:11px; border-radius:50%; }
  .pill.turn { border-color:var(--pink); box-shadow:0 0 0 1px var(--pink) inset; }
  .log { margin-top:16px; font-size:13px; color:#b3a698; max-height:150px; overflow:auto; border-top:1px solid var(--line); padding-top:10px; }
  .log div { padding:2px 0; }
  code { background:#241d19; padding:1px 5px; border-radius:4px; font-size:13px; }
  a { color:#8fc3e8; }
  .hint { font-size:13px; color:#a89c8e; margin-top:8px; }
  .err { color:#ff8a8a; font-size:13px; }
</style>
</head>
<body>
<header>
  <h1>Front<span>line</span></h1>
  <div class="sub">Claim ground. Cut your rivals. 5x5, 2-4 players, ten minutes.</div>
</header>
<main>
  <div id="setup" class="row">
    <input id="code" placeholder="match code" size="10" maxlength="12">
    <button id="join">Join</button>
    <button id="create" class="primary">New match</button>
    <select id="seats"><option value="2">2 players</option><option value="3">3 players</option><option value="4">4 players</option></select>
  </div>

  <div id="game" style="display:none">
    <div class="row" style="margin-top:14px">
      <div id="match" class="hint"></div>
    </div>
    <div class="row" style="margin-top:6px">
      <span class="hint">Play as:</span>
      <button data-seat="0">Seat 1</button>
      <button data-seat="1">Seat 2</button>
      <button data-seat="2">Seat 3</button>
      <button data-seat="3">Seat 4</button>
    </div>
    <div id="board"></div>
    <div class="row">
      <button id="modeClaim" class="on">Claim</button>
      <button id="modeWall">Wall</button>
      <span id="status" class="hint"></span>
    </div>
    <div id="scores" class="bar"></div>
    <div id="log" class="log"></div>
    <div class="hint">Agents: <code>GET /api/game/&lt;id&gt;</code> then <code>POST /api/game/&lt;id&gt;/move</code> with <code>{player,type,cell,version}</code>.</div>
  </div>
</main>
<script>
let S = null, id = null, me = 0, mode = 'claim', timer = null;
const $ = (x) => document.getElementById(x);

function seat() { return Number(localStorage.getItem('fl-seat-' + id) || 0); }

async function api(path, opts) {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

async function create() {
  const players = Number($('seats').value);
  const { j } = await api('/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ players }) });
  if (j.id) location.hash = j.id, start(j.id);
}

async function join() {
  const v = $('code').value.trim().toLowerCase();
  if (!v) return;
  location.hash = v;
  start(v);
}

async function start(codeId) {
  id = codeId;
  me = seat();
  $('setup').style.display = 'none';
  $('game').style.display = 'block';
  await poll();
  if (timer) clearInterval(timer);
  timer = setInterval(poll, 1500);
}

async function poll() {
  const { status, j } = await api('/api/game/' + id);
  if (status !== 200) { $('status').textContent = 'Match not found.'; return; }
  S = j.state;
  render();
}

function render() {
  const b = $('board');
  b.innerHTML = '';
  const legal = new Set(S.legal || []);
  for (let i = 0; i < S.board.length; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (!S.over && S.turn === me && legal.has(i)) {
      cell.className += ' legal';
      cell.onclick = () => move(i);
    }
    const v = S.board[i];
    if (v) {
      const el = document.createElement('div');
      el.className = v.t === 'stone' ? 'stone' : 'wall';
      if (v.t === 'stone') el.style.background = S.players[v.p].color;
      cell.appendChild(el);
    }
    const ix = document.createElement('div');
    ix.className = 'idx';
    ix.textContent = String.fromCharCode(97 + (i % S.size)) + (S.size - Math.floor(i / S.size));
    cell.appendChild(ix);
    b.appendChild(cell);
  }
  const sc = $('scores');
  sc.innerHTML = '';
  for (const p of S.players) {
    const pill = document.createElement('div');
    pill.className = 'pill' + (!S.over && S.turn === p.i ? ' turn' : '');
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = p.color;
    pill.appendChild(dot);
    const who = document.createElement('span');
    who.textContent = (p.i === me ? 'You (' + p.name + ')' : p.name) + ' · ' + S.scores[p.i];
    pill.appendChild(who);
    sc.appendChild(pill);
  }
  if (S.over) {
    $('status').textContent = S.winner === null ? 'Draw. Match over.' : (S.winner === me ? 'You win.' : S.players[S.winner].name + ' wins.');
  } else if (S.turn === me) {
    $('status').textContent = 'Your turn — ' + mode + ' a highlighted cell.';
  } else {
    $('status').textContent = 'Waiting for ' + S.players[S.turn].name + '.';
  }
  $('match').textContent = 'Match ' + S.id + ' · v' + S.version + ' · seat ' + me;
  document.querySelectorAll('[data-seat]').forEach((b) => b.classList.toggle('on', Number(b.dataset.seat) === me));
  const lg = $('log');
  lg.innerHTML = '';
  for (const line of (S.log || []).slice(-40)) {
    const d = document.createElement('div');
    d.textContent = line.text;
    lg.appendChild(d);
  }
  lg.scrollTop = lg.scrollHeight;
}

async function move(cell) {
  const body = { player: me, type: mode, cell, version: S.version };
  const { status, j } = await api('/api/game/' + id + '/move', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (status === 200 && j.state) { S = j.state; render(); }
  else if (status === 409 && j.state) { S = j.state; render(); }
  else { $('status').textContent = 'Rejected: ' + (j.error || status); }
}

$('create').onclick = create;
$('join').onclick = join;
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
$('modeClaim').onclick = () => { mode = 'claim'; $('modeClaim').classList.add('on'); $('modeWall').classList.remove('on'); render(); };
$('modeWall').onclick = () => { mode = 'wall'; $('modeWall').classList.add('on'); $('modeClaim').classList.remove('on'); render(); };
document.querySelectorAll('[data-seat]').forEach((btn) => {
  btn.onclick = () => {
    me = Number(btn.dataset.seat);
    localStorage.setItem('fl-seat-' + id, me);
    document.querySelectorAll('[data-seat]').forEach((b) => b.classList.toggle('on', Number(b.dataset.seat) === me));
    render();
  };
});
document.addEventListener('keydown', (e) => {
  if (e.key === '1') $('modeClaim').click();
  if (e.key === '2') $('modeWall').click();
  if (e.key >= '1' && e.key <= '4' && !S) localStorage.setItem('fl-seat-pre', e.key);
});
$('board').addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h) start(h); });
if (location.hash.length > 1) start(location.hash.slice(1));
</script>
</body>
</html>`;
