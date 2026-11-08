// Frontline — aturan permainan, dipakai worker dan tes lokal.
// Papan 5x5. Tiap pemain mulai dari satu sudut. Giliran: klaim sel kosong yang bertetangga
// dengan batu sendiri, atau pasang tembok di sel kosong yang juga bertetangga dengan batu sendiri.
// Tembok memblokir semua orang, termasuk yang memasangnya. Skor = jumlah batu + 2 x ukuran
// gugus terbesar. Permainan selesai kalau tidak ada pemain yang punya langkah.

export const SIZE = 5;
export const COLORS = ['#e74079', '#10542e', '#2c1f1a', '#1f6fb2'];
export const NAMES = ['Pink', 'Green', 'Ink', 'Blue'];

const CORNERS = [
  [0, 0],
  [SIZE - 1, SIZE - 1],
  [0, SIZE - 1],
  [SIZE - 1, 0],
];

export function neighbors(i) {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  const out = [];
  if (r > 0) out.push(i - SIZE);
  if (r < SIZE - 1) out.push(i + SIZE);
  if (c > 0) out.push(i - 1);
  if (c < SIZE - 1) out.push(i + 1);
  return out;
}

export function createGame(id, playerCount) {
  const n = Math.min(4, Math.max(2, playerCount | 0));
  const board = new Array(SIZE * SIZE).fill(null);
  const players = [];
  for (let p = 0; p < n; p++) {
    const [r, c] = CORNERS[p];
    board[r * SIZE + c] = { t: 'stone', p };
    players.push({ i: p, name: NAMES[p], color: COLORS[p], bot: false });
  }
  return {
    id,
    size: SIZE,
    board,
    players,
    turn: 0,
    version: 1,
    over: false,
    passes: 0,
    winner: null,
    log: [{ n: 0, kind: 'start', text: 'Game started with ' + n + ' players.' }],
  };
}

export function legalMoves(state, player) {
  const mine = new Set();
  state.board.forEach((cell, i) => {
    if (cell && cell.t === 'stone' && cell.p === player) mine.add(i);
  });
  const out = [];
  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i]) continue;
    if (neighbors(i).some((j) => mine.has(j))) out.push(i);
  }
  return out;
}

export function scoreOf(state, player) {
  let stones = 0;
  const seen = new Set();
  let best = 0;
  for (let i = 0; i < state.board.length; i++) {
    const cell = state.board[i];
    if (!cell || cell.t !== 'stone' || cell.p !== player) continue;
    stones++;
    if (seen.has(i)) continue;
    // flood fill gugus
    let size = 0;
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const cur = stack.pop();
      size++;
      for (const nb of neighbors(cur)) {
        const c2 = state.board[nb];
        if (c2 && c2.t === 'stone' && c2.p === player && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    if (size > best) best = size;
  }
  return stones + 2 * best;
}

export function allScores(state) {
  const out = {};
  for (const p of state.players) out[p.i] = scoreOf(state, p.i);
  return out;
}

// Terapkan langkah. Mengembalikan { ok, error, state }.
export function applyMove(state, player, type, cell) {
  if (state.over) return { ok: false, error: 'game_over' };
  if (!state.players.some((p) => p.i === player)) return { ok: false, error: 'unknown_player' };
  if (state.turn !== player) return { ok: false, error: 'not_your_turn' };
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.board.length) return { ok: false, error: 'bad_cell' };
  if (state.board[cell]) return { ok: false, error: 'cell_taken' };
  if (type !== 'claim' && type !== 'wall') return { ok: false, error: 'bad_type' };

  const legal = legalMoves(state, player);
  if (!legal.includes(cell)) return { ok: false, error: 'not_adjacent_to_your_stones' };

  const next = JSON.parse(JSON.stringify(state));
  next.board[cell] = type === 'claim' ? { t: 'stone', p: player } : { t: 'wall', p: player };
  next.version++;
  next.passes = 0;
  next.log.push({
    n: next.log.length,
    kind: type,
    p: player,
    cell,
    text: NAMES[player] + (type === 'claim' ? ' claimed ' : ' walled ') + cellName(cell) + '.',
  });

  advanceTurn(next);
  return { ok: true, state: next };
}

function cellName(i) {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  return String.fromCharCode(97 + c) + (SIZE - r);
}

function advanceTurn(state) {
  const n = state.players.length;
  let moved = 0;
  let idx = state.turn;
  while (moved < n) {
    idx = (idx + 1) % n;
    if (legalMoves(state, idx).length > 0) {
      state.turn = idx;
      state.passes = 0;
      return;
    }
    moved++;
    state.passes++;
  }
  // tidak ada yang bisa bergerak
  state.over = true;
  const scores = allScores(state);
  let best = -1;
  let winners = [];
  for (const p of state.players) {
    const s = scores[p.i];
    if (s > best) {
      best = s;
      winners = [p.i];
    } else if (s === best) winners.push(p.i);
  }
  state.winner = winners.length === 1 ? winners[0] : null;
  state.log.push({
    n: state.log.length,
    kind: 'end',
    text:
      winners.length === 1
        ? NAMES[winners[0]] + ' wins with ' + best + ' points.'
        : 'Draw between ' + winners.map((w) => NAMES[w]).join(' and ') + ' at ' + best + ' points.',
  });
}

export function publicState(state) {
  return {
    id: state.id,
    size: state.size,
    board: state.board,
    players: state.players,
    turn: state.turn,
    version: state.version,
    over: state.over,
    winner: state.winner,
    scores: allScores(state),
    legal: state.over ? [] : legalMoves(state, state.turn),
    log: state.log.slice(-60),
    last: state.log[state.log.length - 1],
  };
}
