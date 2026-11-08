#!/usr/bin/env node
// Sample bot for Frontline. Plays one seat through the public HTTP API.
//
//   node bot.mjs https://frontline.example.workers.dev abc123 1
//
// It reads the state, picks a move, posts it, and repeats until the game ends.
// The point is to show how small an agent client can be, not to be unbeatable.

const [base, id, seatArg] = process.argv.slice(2);
if (!base || !id) {
  console.error('usage: node bot.mjs <base-url> <match-id> [seat]');
  process.exit(1);
}
const seat = Number(seatArg || 1);

const SIZE = 5;
function neighbors(i) {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  const out = [];
  if (r > 0) out.push(i - SIZE);
  if (r < SIZE - 1) out.push(i + SIZE);
  if (c > 0) out.push(i - 1);
  if (c < SIZE - 1) out.push(i + 1);
  return out;
}

function choose(state) {
  const legal = state.legal;
  if (!legal.length) return null;

  // Siapa pemimpin sementara? Tembok dipakai untuk menahan dia, bukan untuk semua orang.
  const scores = state.scores;
  const leader = Object.keys(scores).sort((a, b) => scores[b] - scores[a])[0];

  let best = null;
  for (const cell of legal) {
    let own = 0;
    let enemy = 0;
    for (const nb of neighbors(cell)) {
      const v = state.board[nb];
      if (v && v.t === 'stone') {
        if (v.p === seat) own++;
        else enemy++;
      }
    }
    const claimValue = own * 4 + enemy * 1;
    if (!best || claimValue > best.value) best = { cell, type: 'claim', value: claimValue };
  }

  // Kalau lawan memimpin jauh, satu tembok di depan gugusnya lebih bernilai daripada satu batu.
  const gap = Number(scores[leader] || 0) - Number(scores[seat] || 0);
  if (gap >= 3 && leader !== String(seat)) {
    for (const cell of legal) {
      const touchesLeader = neighbors(cell).some((nb) => {
        const v = state.board[nb];
        return v && v.t === 'stone' && String(v.p) === String(leader);
      });
      if (touchesLeader) return { cell, type: 'wall' };
    }
  }
  return best;
}

async function getJson(url, opts) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, opts);
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch {
      // Cloudflare kadang membalas halaman HTML saat dua penulis bertabrakan; coba lagi.
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
  }
  throw new Error('server tidak membalas JSON setelah 4 percobaan');
}

async function main() {
  for (let step = 0; step < 400; step++) {
    const { state } = await getJson(base + '/api/game/' + id);
    if (!state) throw new Error('match not found');
    if (state.over) {
      console.log('game over, scores', JSON.stringify(state.scores), 'winner', state.winner);
      return;
    }
    if (state.turn !== seat) {
      await new Promise((res) => setTimeout(res, 900));
      continue;
    }
    const mv = choose(state);
    if (!mv) {
      await new Promise((res) => setTimeout(res, 900));
      continue;
    }
    const out = await getJson(base + '/api/game/' + id + '/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ player: seat, type: mv.type, cell: mv.cell, version: state.version }),
    });
    if (!out.ok) {
      if (out.error === 'busy' || out.error === 'stale_version') {
        await new Promise((res) => setTimeout(res, 1200));
        continue;
      }
      console.log('rejected', out.error);
    } else console.log('played', mv.type, mv.cell, '-> scores', JSON.stringify(out.state.scores));
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
