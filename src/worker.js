// Frontline — Cloudflare Worker. State per game disimpan di KV.
// Rute:
//   GET  /                       papan untuk manusia
//   POST /api/game               buat permainan  {players:2..4}
//   GET  /api/game/:id           state publik
//   POST /api/game/:id/move      {player, type:"claim"|"wall", cell, version?}
//   GET  /api/game/:id/log       riwayat langkah
import { createGame, applyMove, publicState } from './game.js';
import { HTML } from './html.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });
}

function code() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  for (const b of rnd) s += alphabet[b % alphabet.length];
  return s;
}

async function load(env, id) {
  const raw = await env.FRONTLINE.get('game:' + id);
  return raw ? JSON.parse(raw) : null;
}

async function save(env, state) {
  // KV membatasi satu tulisan per detik per key. Dua pemain yang bergerak hampir bersamaan
  // akan kena 429; ulangi sebentar sebelum menyerah, jangan lempar error ke pemain.
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await env.FRONTLINE.put('game:' + state.id, JSON.stringify(state), { expirationTtl: 60 * 60 * 24 * 14 });
      return true;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  console.error('kv put gagal: ' + (lastErr && lastErr.message));
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (path === '/' || path === '/index.html') {
      return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    if (path === '/health') return json({ ok: true, service: 'frontline' });

    if (path === '/api/game' && request.method === 'POST') {
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const players = Number(body.players || 2);
      const id = code();
      const state = createGame(id, players);
      const saved = await save(env, state);
      if (!saved) return json({ ok: false, error: 'busy' }, 503);
      return json({ ok: true, id, state: publicState(state) }, 201);
    }

    const m = path.match(/^\/api\/game\/([a-z0-9]{4,12})(\/move|\/log)?$/);
    if (m) {
      const id = m[1];
      const state = await load(env, id);
      if (!state) return json({ ok: false, error: 'not_found' }, 404);

      if (!m[2] && request.method === 'GET') return json({ ok: true, state: publicState(state) });

      if (m[2] === '/log' && request.method === 'GET') return json({ ok: true, log: state.log });

      if (m[2] === '/move' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: 'bad_json' }, 400);
        }
        if (body.version !== undefined && Number(body.version) !== state.version) {
          return json({ ok: false, error: 'stale_version', state: publicState(state) }, 409);
        }
        const res = applyMove(state, Number(body.player), String(body.type), Number(body.cell));
        if (!res.ok) return json({ ok: false, error: res.error, state: publicState(state) }, 400);
        const saved = await save(env, res.state);
        if (!saved) return json({ ok: false, error: 'busy', retry: true, state: publicState(state) }, 503);
        return json({ ok: true, state: publicState(res.state) });
      }
    }

    return json({ ok: false, error: 'not_found' }, 404);
  },
};
