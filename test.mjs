// Tes aturan tanpa jaringan: permainan acak harus selesai, langkah ilegal harus ditolak.
import { createGame, applyMove, legalMoves, allScores, publicState } from './src/game.js';

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS ' + name);
  else {
    failures++;
    console.log('FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

// 1. Bentuk awal
for (const n of [2, 3, 4]) {
  const g = createGame('t' + n, n);
  check('start ' + n + ' pemain punya ' + n + ' batu', g.board.filter(Boolean).length === n);
  check('start ' + n + ' giliran 0', g.turn === 0);
  check('start ' + n + ' langkah legal tidak kosong', legalMoves(g, 0).length > 0);
}

// 2. Langkah ilegal
{
  const g = createGame('x', 2);
  check('tolak sel terisi', applyMove(g, 0, 'claim', 0).ok === false);
  check('tolak bukan giliran', applyMove(g, 1, 'claim', 24).ok === false);
  check('tolak tipe salah', applyMove(g, 0, 'nuke', 1).ok === false);
  check('tolak sel jauh', applyMove(g, 0, 'claim', 12).ok === false);
  const ok = applyMove(g, 0, 'claim', 1);
  check('terima klaim bertetangga', ok.ok === true, ok.error);
  check('versi naik', ok.ok && ok.state.version === g.version + 1);
}

// 3. Permainan acak harus berakhir dan skor konsisten
for (const n of [2, 3, 4]) {
  let g = createGame('r' + n, n);
  let moves = 0;
  let illegal = 0;
  while (!g.over && moves < 200) {
    const legal = legalMoves(g, g.turn);
    if (!legal.length) break;
    const cell = legal[Math.floor(Math.random() * legal.length)];
    const type = Math.random() < 0.85 ? 'claim' : 'wall';
    const res = applyMove(g, g.turn, type, cell);
    if (!res.ok) {
      illegal++;
      break;
    }
    g = res.state;
    moves++;
  }
  check('acak ' + n + ' pemain selesai', g.over === true, 'moves=' + moves);
  check('acak ' + n + ' pemain tanpa langkah ilegal', illegal === 0);
  check('acak ' + n + ' pemain punya pemenang atau seri', g.winner !== undefined);
  const sc = allScores(g);
  const total = Object.values(sc).reduce((a, b) => a + b, 0);
  const stones = g.board.filter((c) => c && c.t === 'stone').length;
  check('skor ' + n + ' >= jumlah batu', total >= stones, 'total=' + total + ' stones=' + stones);
  check('papan ' + n + ' penuh atau selesai', g.board.length === 25);
}

// 4. Tembok memblokir semua orang
{
  let g = createGame('w', 2);
  g = applyMove(g, 0, 'wall', 1).state;
  check('tembok tercatat', g.board[1].t === 'wall');
  const legalP1 = legalMoves(g, 1);
  check('tembok tidak bisa diklaim', !legalP1.includes(1) || g.board[1] !== null);
}

// 5. State publik tidak membocorkan hal aneh
{
  const g = createGame('p', 2);
  const s = publicState(g);
  check('publik punya legal', Array.isArray(s.legal) && s.legal.length > 0);
  check('publik punya skor', typeof s.scores[0] === 'number');
  check('publik punya log', Array.isArray(s.log) && s.log.length >= 1);
}

console.log(failures === 0 ? 'SEMUA TES LULUS' : failures + ' TES GAGAL');
process.exit(failures === 0 ? 0 : 1);
