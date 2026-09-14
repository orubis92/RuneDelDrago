/* Rune del Drago — motore di gioco (puro, senza DOM)
 * Funziona sia nel browser (window.RuneEngine) sia in Node (module.exports).
 *
 * Regole:
 *  - Il fuoco parte dalla bocca del drago e scorre nei canali collegati.
 *  - Il ghiaccio blocca il fuoco finché non viene spaccato da un fulmine.
 *  - Il fulmine parte dalle rune del tuono; quando raggiunge una tessera di
 *    ghiaccio la spacca e si scarica lì (non prosegue oltre).
 *  - Se il fulmine tocca il drago o la porta della tana, il livello fallisce.
 *  - Vinci quando il fuoco raggiunge la porta e nessun fulmine ha toccato
 *    drago o porta.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RuneEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const N = 1, E = 2, S = 4, W = 8;
  const DIRS = [
    { dx: 0, dy: -1, bit: N, opp: S },
    { dx: 1, dy: 0, bit: E, opp: W },
    { dx: 0, dy: 1, bit: S, opp: N },
    { dx: -1, dy: 0, bit: W, opp: E },
  ];

  function rotMask(mask, times) {
    times = ((times % 4) + 4) % 4;
    for (let i = 0; i < times; i++) mask = ((mask << 1) | (mask >> 3)) & 15;
    return mask;
  }

  // PRNG deterministico (mulberry32)
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  function shuffle(rng, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---- Parametri di difficoltà per livello ------------------------------
  function paramsFor(level) {
    if (level <= 3) return { n: 4, ice: 0, rockP: 0.45, extraIce: 0 };
    if (level <= 6) return { n: 5, ice: 1, rockP: 0.35, extraIce: 0 };
    if (level <= 9) return { n: 5, ice: 1, rockP: 0.3, extraIce: 0.05 };
    if (level <= 14) return { n: 6, ice: level % 2 === 0 ? 2 : 1, rockP: 0.28, extraIce: 0.06 };
    if (level <= 22) return { n: 6, ice: 2, rockP: 0.22, extraIce: 0.08 };
    if (level <= 35) return { n: 7, ice: 2 + (level % 2), rockP: 0.2, extraIce: 0.08 };
    return { n: 8, ice: 3, rockP: 0.16, extraIce: 0.1 };
  }

  // ---- Utilità griglia --------------------------------------------------
  function neighbors(n, i) {
    const x = i % n, y = (i / n) | 0, out = [];
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (nx >= 0 && ny >= 0 && nx < n && ny < n) out.push({ j: ny * n + nx, d });
    }
    return out;
  }

  // Foresta di copertura casuale (DFS randomizzato) sulle celle `allowed`.
  // Ritorna adj[i] = bitmask delle direzioni degli archi dell'albero.
  function randomForest(n, allowed, rng) {
    const adj = new Uint8Array(n * n);
    const seen = new Uint8Array(n * n);
    const order = shuffle(rng, [...Array(n * n).keys()].filter(i => allowed[i]));
    for (const start of order) {
      if (seen[start]) continue;
      const stack = [start]; seen[start] = 1;
      while (stack.length) {
        const i = stack[stack.length - 1];
        const cand = neighbors(n, i).filter(o => allowed[o.j] && !seen[o.j]);
        if (!cand.length) { stack.pop(); continue; }
        const o = pick(rng, cand);
        seen[o.j] = 1; adj[i] |= o.d.bit; adj[o.j] |= o.d.opp; stack.push(o.j);
      }
    }
    return adj;
  }

  // BFS sull'albero: ritorna {dist, parent}
  function treeBFS(n, adj, start) {
    const dist = new Int32Array(n * n).fill(-1), parent = new Int32Array(n * n).fill(-1);
    const q = [start]; dist[start] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (const o of neighbors(n, i)) {
        if ((adj[i] & o.d.bit) && dist[o.j] < 0) { dist[o.j] = dist[i] + 1; parent[o.j] = i; q.push(o.j); }
      }
    }
    return { dist, parent };
  }

  function dirBetween(n, from, to) {
    for (const o of neighbors(n, from)) if (o.j === to) return o.d;
    return null;
  }

  // ---- Generazione livello ----------------------------------------------
  function tryGenerate(p, rng, level) {
    const n = p.n, T = n * n;
    const all = new Uint8Array(T).fill(1);
    const maze = randomForest(n, all, rng);

    // Drago su una cella di bordo
    const border = [...Array(T).keys()].filter(i => { const x = i % n, y = (i / n) | 0; return x === 0 || y === 0 || x === n - 1 || y === n - 1; });
    const dragon = pick(rng, border);
    const { dist, parent } = treeBFS(n, maze, dragon);
    let maxD = 0; for (let i = 0; i < T; i++) if (dist[i] > maxD) maxD = dist[i];
    const minD = Math.max(3, Math.floor(maxD * 0.6));
    const doorCand = [...Array(T).keys()].filter(i => dist[i] >= minD);
    if (!doorCand.length) return null;
    const door = pick(rng, doorCand);

    // Percorso del fuoco (unico nell'albero)
    const path = [];
    for (let c = door; c !== -1; c = parent[c]) path.push(c);
    path.reverse(); // dragon ... door
    const onPath = new Uint8Array(T);
    path.forEach(i => onPath[i] = 1);

    const tiles = new Array(T);
    for (let i = 0; i < T; i++) tiles[i] = { type: 'rock', base: 0, rot: 0, fixed: true, sol: false };
    for (let k = 0; k < path.length; k++) {
      const i = path[k];
      let m = 0;
      if (k > 0) m |= dirBetween(n, i, path[k - 1]).bit;
      if (k < path.length - 1) m |= dirBetween(n, i, path[k + 1]).bit;
      tiles[i] = { type: 'path', base: m, rot: 0, fixed: false, sol: true };
    }
    tiles[dragon].type = 'dragon'; tiles[dragon].fixed = true;
    tiles[door].type = 'door'; tiles[door].fixed = true;

    // Celle libere (non sul percorso del fuoco)
    const free = new Uint8Array(T);
    for (let i = 0; i < T; i++) free[i] = onPath[i] ? 0 : 1;
    const forest = randomForest(n, free, rng);
    // componenti della foresta
    const comp = new Int32Array(T).fill(-1);
    let nc = 0;
    for (let i = 0; i < T; i++) {
      if (!free[i] || comp[i] >= 0) continue;
      const q = [i]; comp[i] = nc;
      for (let h = 0; h < q.length; h++) for (const o of neighbors(n, q[h])) if ((forest[q[h]] & o.d.bit) && comp[o.j] < 0) { comp[o.j] = nc; q.push(o.j); }
      nc++;
    }

    let rune = -1;
    const iceCells = [];
    if (p.ice > 0) {
      // candidati ghiaccio: celle interne del percorso con almeno un vicino libero
      const inner = path.slice(1, -1).map((i, k) => ({ i, k: k + 1 }))
        .filter(o => neighbors(n, o.i).some(q => free[q.j]));
      shuffle(rng, inner);
      const chosen = [];
      for (const o of inner) {
        if (chosen.every(c => Math.abs(c.k - o.k) >= 2)) chosen.push(o);
        if (chosen.length === p.ice) break;
      }
      if (chosen.length < p.ice) return null;
      // trova una componente libera adiacente a tutti i ghiacci
      const compOpts = new Map(); // comp -> [ [adj cells of ice0], [ice1] ...]
      for (let ci = 0; ci < chosen.length; ci++) {
        for (const q of neighbors(n, chosen[ci].i)) {
          if (!free[q.j]) continue;
          const c = comp[q.j];
          if (!compOpts.has(c)) compOpts.set(c, chosen.map(() => []));
          compOpts.get(c)[ci].push(q.j);
        }
      }
      const goodComps = [...compOpts.entries()].filter(([, lists]) => lists.every(l => l.length));
      if (!goodComps.length) return null;
      const [cid, lists] = pick(rng, goodComps);
      const attach = lists.map(l => pick(rng, l));
      const compCells = [...Array(T).keys()].filter(i => free[i] && comp[i] === cid);
      if (compCells.length < chosen.length + 1) return null;
      // runa: cella della componente lontana dai punti di attacco, non attacco
      const distToAttach = new Int32Array(T).fill(1e9);
      for (const a of attach) { const b = treeBFS(n, forest, a); for (let i = 0; i < T; i++) if (b.dist[i] >= 0) distToAttach[i] = Math.min(distToAttach[i], b.dist[i]); }
      let runeCand = compCells.filter(i => distToAttach[i] >= 3);
      if (!runeCand.length) runeCand = compCells.filter(i => distToAttach[i] >= 1);
      if (!runeCand.length) return null;
      rune = pick(rng, runeCand);
      // unione dei cammini runa -> attacco
      const rb = treeBFS(n, forest, rune);
      const L = new Uint8Array(T);
      for (const a of attach) {
        for (let c = a; c !== rune; c = rb.parent[c]) {
          const par = rb.parent[c];
          const d = dirBetween(n, c, par);
          L[c] |= d.bit; L[par] |= d.opp;
        }
      }
      for (let i = 0; i < T; i++) if (L[i]) tiles[i] = { type: 'path', base: L[i], rot: 0, fixed: false, sol: true };
      tiles[rune].type = 'rune';
      for (let ci = 0; ci < chosen.length; ci++) {
        const ice = chosen[ci].i, a = attach[ci];
        const d = dirBetween(n, ice, a);
        tiles[ice].type = 'ice'; tiles[ice].base |= d.bit;
        tiles[a].base |= d.opp;
        iceCells.push(ice);
      }
    }

    // Distrattori: resto della foresta, alcune celle diventano roccia
    for (let i = 0; i < T; i++) {
      if (!free[i] || tiles[i].type !== 'rock') continue;
      const m = forest[i];
      if (m === 0 || rng() < p.rockP) continue; // resta roccia
      const type = rng() < p.extraIce ? 'ice' : 'path';
      tiles[i] = { type, base: m, rot: 0, fixed: false, sol: false };
    }

    // Mescola le rotazioni
    for (const t of tiles) {
      if (t.fixed || t.type === 'rock') continue;
      t.rot = Math.floor(rng() * 4);
    }
    // Evita che il livello sia già risolto
    let guard = 0;
    while (simulate(tiles, n).win && guard++ < 20) {
      const t = tiles[pick(rng, path.slice(1, -1))];
      t.rot = (t.rot + 1) % 4;
    }
    if (simulate(tiles, n).win) return null;

    return { level, n, tiles, dragon, door, rune, iceCells, pathLength: path.length };
  }

  function generate(level) {
    const p = paramsFor(level);
    for (let attempt = 0; attempt < 500; attempt++) {
      const rng = mulberry32((level * 7919 + attempt * 104729 + 20260914) | 0);
      const lv = tryGenerate(p, rng, level);
      if (lv) { lv.attempt = attempt; return lv; }
    }
    throw new Error('Impossibile generare il livello ' + level);
  }

  // ---- Simulazione ------------------------------------------------------
  function maskOf(t) { return rotMask(t.base, t.rot); }

  function simulate(tiles, n) {
    const T = n * n;
    const lit = new Uint8Array(T), cracked = new Uint8Array(T);
    const fire = new Uint8Array(T), blocked = new Uint8Array(T);
    const litDepth = new Int16Array(T).fill(-1), fireDepth = new Int16Array(T).fill(-1);
    const zapped = [];
    const conn = (i, j, d) => (maskOf(tiles[i]) & d.bit) && (maskOf(tiles[j]) & d.opp);

    // Fulmine
    let q = [];
    for (let i = 0; i < T; i++) if (tiles[i].type === 'rune') { lit[i] = 1; litDepth[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (const o of neighbors(n, i)) {
        if (lit[o.j] || !conn(i, o.j, o.d)) continue;
        lit[o.j] = 1; litDepth[o.j] = litDepth[i] + 1;
        const ty = tiles[o.j].type;
        if (ty === 'ice') { cracked[o.j] = 1; continue; }     // si scarica sul ghiaccio
        if (ty === 'dragon' || ty === 'door') { zapped.push(o.j); continue; }
        q.push(o.j);
      }
    }
    // Fuoco
    q = [];
    for (let i = 0; i < T; i++) if (tiles[i].type === 'dragon') { fire[i] = 1; fireDepth[i] = 0; q.push(i); }
    let doorReached = false;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (const o of neighbors(n, i)) {
        if (fire[o.j] || !conn(i, o.j, o.d)) continue;
        const ty = tiles[o.j].type;
        if (ty === 'ice' && !cracked[o.j]) { blocked[o.j] = 1; continue; }
        fire[o.j] = 1; fireDepth[o.j] = fireDepth[i] + 1;
        if (ty === 'door') doorReached = true;
        q.push(o.j);
      }
    }
    let maxDepth = 0;
    for (let i = 0; i < T; i++) maxDepth = Math.max(maxDepth, fireDepth[i], litDepth[i]);
    const win = doorReached && zapped.length === 0;
    return { lit, cracked, fire, blocked, litDepth, fireDepth, zapped, doorReached, win, maxDepth };
  }

  // Tessera in orientamento "sbagliato" rispetto alla soluzione prevista
  function isMisrotated(t) { return !t.fixed && t.type !== 'rock' && maskOf(t) !== t.base; }

  // Mosse minime per la soluzione prevista: per ogni tessera della soluzione,
  // il minor numero di rotazioni orarie che riporta la maschera a quella di base.
  function parMoves(lv) {
    let total = 0;
    for (const t of lv.tiles) {
      if (!t.sol || t.fixed || t.type === 'rock') continue;
      for (let k = 0; k < 4; k++) if (rotMask(t.base, t.rot + k) === t.base) { total += k; break; }
    }
    return total;
  }
  // Stelle: 3 = entro il minimo, 2 = entro il 150%, 1 = risolto. Un indizio toglie una stella.
  function stars(moves, par, hintsUsed) {
    let s = moves <= par ? 3 : moves <= Math.ceil(par * 1.5) ? 2 : 1;
    if (hintsUsed > 0) s = Math.min(s, 2);
    return s;
  }

  // Indizio: sistema una tessera della soluzione e la blocca. Ritorna l'indice o -1.
  function applyHint(lv, rng) {
    const wrong = lv.tiles.map((t, i) => ({ t, i })).filter(o => o.t.sol && isMisrotated(o.t) && !o.t.locked);
    if (!wrong.length) return -1;
    const o = wrong[Math.floor((rng ? rng() : Math.random()) * wrong.length)];
    o.t.rot = 0; o.t.locked = true;
    return o.i;
  }

  return { N, E, S, W, DIRS, rotMask, maskOf, mulberry32, paramsFor, generate, simulate, isMisrotated, applyHint, neighbors, parMoves, stars };
});
