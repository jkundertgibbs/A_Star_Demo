/**
 * A* Pathfinding Demo (16:9) — React Canvas
 * Author/Credit: John L. Gibbs ("Dr. Know It All") — https://www.youtube.com/@DrKnowItAll
 * Please keep this header if you share or modify the code.
 *
 * ▶ How to run locally (Vite + Tailwind, recommended)
 * 1) npm create vite@latest a-star-demo -- --template react
 * 2) cd a-star-demo && npm i
 * 3) npm i -D tailwindcss postcss autoprefixer && npx tailwindcss init -p
 * 4) In tailwind.config.js set:
 *    content: ["./index.html","./src//.{js,ts,jsx,tsx}"]
 * 5) In src/index.css add (at the very top):
 *      @tailwind base;
 * @tailwind components;
 * @tailwind utilities;
 * 6) Save THIS file as src/AStarPathfindingDemo.jsx
 * 7) Replace src/App.jsx with:
 *      import Demo from "./AStarPathfindingDemo.jsx";
export default function App(){ return <Demo/> }
 * 8) npm run dev  → open http://localhost:5173/
 *
 * 💡 Alternate: you can run without Tailwind; it will still function but look plain.
 *
 * Controls: Play/Pause • Step • Reset • Regenerate • Speed • Obstacle density • Seed • Grid size • Guarantee solvable
 * Algorithm: 4-way moves, g=1 per move, h = Manhattan (L1), ties broken on lower h.
 * Self-tests: basic assertions run once on mount (open DevTools console).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

// 16:9 interactive A* demo for a rectangular grid.
// Start = top-left, Goal = bottom-right
// g = 1 per move, h = Manhattan (L1), 4-way moves
// Frontier (open) blue • Explored (closed) gray • Current orange • Path gold
// Click grid (paused) to toggle walls. Seeded obstacles; optional solvable guarantee.

const CANVAS_W = 960; // CSS pixels (good for 1080p capture too)
const CANVAS_H = 540; // 16:9 aspect

// --- Self-tests -------------------------------------------------------------
// Always include some quick sanity checks so regressions are obvious.
const ENABLE_SELF_TESTS = true;

function runSelfTests() {
  try {
    // Helper to build an engine and exhaust it
    const run = (w, h, walls) => {
      const eng = new AStarEngine(w, h, walls);
      let guard = 0;
      while (!eng.finished && guard++ < 1e6) eng.step();
      return eng;
    };

    // Test 1: empty 5x5 grid should have shortest path length = w + h - 1 = 9 cells
    {
      const w = 5, h = 5;
      const walls = new Uint8Array(w * h);
      const eng = run(w, h, walls);
      console.assert(eng.finished && eng.success, "Test1: should succeed");
      console.assert(eng.path.length === w + h - 1, `Test1: path length ${eng.path.length} !== 9`);
    }

    // Test 2: barrier but solvable (bend around a wall)
    {
      const w = 5, h = 5;
      const walls = new Uint8Array(w * h);
      // Add a chunky block in the middle forcing a detour
      const block = [
        [2, 1], [2, 2], [2, 3], [1, 2], [3, 2]
      ];
      for (const [x, y] of block) walls[y * w + x] = 1;
      const eng = run(w, h, walls);
      console.assert(eng.finished && eng.success, "Test2: should still succeed");
      console.assert(eng.path.length > w + h - 1, "Test2: path should be longer than empty grid");
    }

    // Test 3: no-path case (solid horizontal wall at y=1)
    {
      const w = 5, h = 5;
      const walls = new Uint8Array(w * h);
      for (let x = 0; x < w; x++) walls[1 * w + x] = 1; // blocks row under the start row completely
      const eng = run(w, h, walls);
      console.assert(eng.finished && !eng.success, "Test3: should fail (no path)");
    }

    console.debug("A* self-tests passed.");
  } catch (e) {
    console.error("A* self-tests error:", e);
  }
}

// --- Seeded RNG helpers -----------------------------------------------------
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFromSeed(seedStr) {
  const seed = xmur3(seedStr)();
  return mulberry32(seed);
}

// --- A* Engine --------------------------------------------------------------
class AStarEngine {
  constructor(w, h, obstacles) {
    this.w = w;
    this.h = h;
    this.start = 0; // (0,0)
    this.goal = w * h - 1; // (w-1,h-1)

    this.obstacles = obstacles; // Uint8Array 0/1

    const n = w * h;
    this.g = new Float32Array(n).fill(Infinity);
    this.f = new Float32Array(n).fill(Infinity);
    this.hScore = new Float32Array(n);
    this.came = new Int32Array(n).fill(-1);
    this.open = []; // array of node indices (we'll scan for min)
    this.inOpen = new Uint8Array(n); // 0/1 flag
    this.closed = new Uint8Array(n); // 0/1 flag

    // Precompute Manhattan h to goal
    const gx = w - 1;
    const gy = h - 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = this.idx(x, y);
        this.hScore[i] = Math.abs(gx - x) + Math.abs(gy - y);
      }
    }

    // Init start
    this.g[this.start] = 0;
    this.f[this.start] = this.hScore[this.start];
    this.open.push(this.start);
    this.inOpen[this.start] = 1;

    this.current = -1; // the node just popped this step
    this.finished = false;
    this.success = false;
    this.path = [];
    this.iter = 0;
  }

  idx(x, y) { return y * this.w + x; }
  xy(i) { return [i % this.w, Math.floor(i / this.w)]; }

  neighbors(i) {
    const [x, y] = this.xy(i);
    const nn = [];
    if (x > 0) nn.push(i - 1);
    if (x < this.w - 1) nn.push(i + 1);
    if (y > 0) nn.push(i - this.w);
    if (y < this.h - 1) nn.push(i + this.w);
    return nn;
  }

  // One A* expansion step. Returns a snapshot of key info.
  step() {
    if (this.finished) return { done: true };
    this.iter++;

    // pick node in open set with lowest f (tie-break on lower h)
    if (this.open.length === 0) {
      this.finished = true;
      this.success = false;
      return { done: true };
    }
    let bestIdx = 0;
    let best = this.open[0];
    let bestF = this.f[best];
    let bestH = this.hScore[best];
    for (let k = 1; k < this.open.length; k++) {
      const node = this.open[k];
      const f = this.f[node];
      if (f < bestF || (f === bestF && this.hScore[node] < bestH)) {
        bestIdx = k; best = node; bestF = f; bestH = this.hScore[node];
      }
    }

    // pop best
    const current = best;
    this.current = current;
    this.open.splice(bestIdx, 1);
    this.inOpen[current] = 0;
    this.closed[current] = 1;

    // goal check
    if (current === this.goal) {
      this.finished = true;
      this.success = true;
      this.path = this.reconstructPath(current);
      return { done: true };
    }

    // expand neighbors
    const gn = this.g[current] + 1; // cost per move is 1
    for (const nb of this.neighbors(current)) {
      if (this.closed[nb]) continue;
      if (this.obstacles[nb]) continue; // wall
      if (Number.isFinite(this.g[nb]) && gn >= this.g[nb]) continue;
      // better path found
      this.came[nb] = current;
      this.g[nb] = gn;
      this.f[nb] = gn + this.hScore[nb];
      if (!this.inOpen[nb]) { this.open.push(nb); this.inOpen[nb] = 1; }
    }

    return { done: false, current, openCount: this.open.length, iter: this.iter };
  }

  reconstructPath(end) {
    const path = [];
    let cur = end;
    while (cur !== -1) { path.push(cur); cur = this.came[cur]; }
    return path.reverse();
  }
}

// BFS to check if a path exists (used to guarantee solvable obstacle layouts)
function pathExists(w, h, obstacles) {
  const start = 0; const goal = w * h - 1;
  if (obstacles[start] || obstacles[goal]) return false;
  const q = [start]; const seen = new Uint8Array(w * h); seen[start] = 1;
  while (q.length) {
    const i = q.shift(); if (i === goal) return true;
    const x = i % w; const y = (i / w) | 0;
    if (x > 0) { const j = i - 1; if (!seen[j] && !obstacles[j]) { seen[j] = 1; q.push(j); } }
    if (x < w - 1) { const j = i + 1; if (!seen[j] && !obstacles[j]) { seen[j] = 1; q.push(j); } }
    if (y > 0) { const j = i - w; if (!seen[j] && !obstacles[j]) { seen[j] = 1; q.push(j); } }
    if (y < h - 1) { const j = i + w; if (!seen[j] && !obstacles[j]) { seen[j] = 1; q.push(j); } }
  }
  return false;
}

function generateObstacles(w, h, density, seedStr, guaranteeSolvable) {
  let rng = rngFromSeed(seedStr);
  const maxTries = guaranteeSolvable ? 120 : 1;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const walls = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) walls[i] = 0;
    const start = 0; const goal = w * h - 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (i === start || i === goal) continue;
        if (rng() < density) walls[i] = 1;
      }
    }
    if (!guaranteeSolvable || pathExists(w, h, walls)) {
      return { walls, seed: seedStr, attempts: attempt + 1 };
    }
    seedStr = seedStr + "*"; // tweak seed and try again
    rng = rngFromSeed(seedStr);
  }
  return { walls: new Uint8Array(w * h), seed: seedStr, attempts: maxTries };
}

export default function AStarPathfindingDemo() {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const canvasRef = useRef(null);

  // Grid settings (16:9 friendly defaults)
  const [gridW, setGridW] = useState(64);
  const [gridH, setGridH] = useState(36);
  const [density, setDensity] = useState(0.22);
  const [seed, setSeed] = useState("dr-knowitall-a-star");
  const [guarantee, setGuarantee] = useState(true);

  // Simulation state
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(6); // steps per second
  const [attempts, setAttempts] = useState(1);

  const [engine, setEngine] = useState(null);
  const engineRef = useRef(null);
  const timestampRef = useRef(0);
  const accRef = useRef(0);

  // Derived: cellSize and offsets to center the grid
  const layout = useMemo(() => {
    const cell = Math.floor(Math.min(CANVAS_W / gridW, CANVAS_H / gridH));
    const gw = cell * gridW; const gh = cell * gridH;
    const ox = Math.floor((CANVAS_W - gw) / 2);
    const oy = Math.floor((CANVAS_H - gh) / 2);
    return { cell, ox, oy, gw, gh };
  }, [gridW, gridH]);

  // Init or regenerate
  const regenerate = React.useCallback(() => {
    const { walls, attempts: at } = generateObstacles(
      gridW, gridH, density, seed, guarantee
    );
    const eng = new AStarEngine(gridW, gridH, walls);
    setEngine(eng); engineRef.current = eng; setAttempts(at);
  }, [gridW, gridH, density, seed, guarantee]);

  useEffect(() => { regenerate(); setRunning(false); }, [gridW, gridH, density, seed, guarantee, regenerate]);

  // Run quick self-tests once on mount
  useEffect(() => { if (ENABLE_SELF_TESTS) runSelfTests(); }, []);

  // Animation loop for Play mode
  useEffect(() => {
    let rafId; const stepInterval = 1 / Math.max(0.1, speed);
    const loop = (ts) => {
      if (!timestampRef.current) timestampRef.current = ts;
      const dt = (ts - timestampRef.current) / 1000; timestampRef.current = ts;
      if (running && engineRef.current && !engineRef.current.finished) {
        accRef.current += dt;
        while (accRef.current >= stepInterval) { engineRef.current.step(); accRef.current -= stepInterval; }
      }
      draw(); rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop); return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, speed, layout]);

  // Drawing -----------------------------------------------------------------
  function draw() {
    const canvas = canvasRef.current; if (!canvas || !engineRef.current) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    // HiDPI
    const cssW = CANVAS_W; const cssH = CANVAS_H;
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr); canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
    }
    ctx.save(); ctx.scale(dpr, dpr);

    // page background (dark so white grid pops)
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, cssW, cssH);

    const { cell, ox, oy, gw, gh } = layout;
    const eng = engineRef.current;

    // grid background (white squares)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(ox, oy, gw, gh);

    // explored (closed) overlay
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i < eng.closed.length; i++) {
      if (!eng.closed[i]) continue;
      const x = (i % eng.w) * cell + ox; const y = Math.floor(i / eng.w) * cell + oy;
      ctx.fillRect(x, y, cell, cell);
    }

    // frontier (open set) in blue
    ctx.fillStyle = "rgba(80,140,255,0.35)";
    for (const i of eng.open) {
      const x = (i % eng.w) * cell + ox; const y = Math.floor(i / eng.w) * cell + oy;
      ctx.fillRect(x, y, cell, cell);
    }

    // obstacles in near-black
    ctx.fillStyle = "#0b0b0f";
    for (let i = 0; i < eng.obstacles.length; i++) {
      if (!eng.obstacles[i]) continue;
      const x = (i % eng.w) * cell + ox; const y = Math.floor(i / eng.w) * cell + oy;
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }

    // current node (being expanded) in orange
    if (eng.current >= 0) {
      const cx = (eng.current % eng.w) * cell + ox; const cy = Math.floor(eng.current / eng.w) * cell + oy;
      ctx.fillStyle = "#ff9f1a"; ctx.fillRect(cx + 2, cy + 2, cell - 4, cell - 4);
    }

    // path (if finished and success) in gold
    if (eng.finished && eng.success) {
      ctx.fillStyle = "#ffd166";
      for (const i of eng.path) {
        const x = (i % eng.w) * cell + ox; const y = Math.floor(i / eng.w) * cell + oy;
        ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
      }
    }

    // start & goal markers
    const startX = ox + 0 * cell; const startY = oy + 0 * cell;
    const goalX = ox + (eng.w - 1) * cell; const goalY = oy + (eng.h - 1) * cell;
    ctx.fillStyle = "#00d084"; ctx.fillRect(startX + 2, startY + 2, cell - 4, cell - 4); // start (green)
    ctx.fillStyle = "#ef476f"; ctx.fillRect(goalX + 2, goalY + 2, cell - 4, cell - 4);   // goal (red)

    // grid lines (subtle dark on white)
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= eng.w; x++) {
      const gx = ox + x * cell + 0.5; ctx.beginPath();
      ctx.moveTo(gx, oy + 0.5); ctx.lineTo(gx, oy + gh + 0.5); ctx.stroke();
    }
    for (let y = 0; y <= eng.h; y++) {
      const gy = oy + y * cell + 0.5; ctx.beginPath();
      ctx.moveTo(ox + 0.5, gy); ctx.lineTo(ox + gw + 0.5, gy); ctx.stroke();
    }

    // Legend overlay (positioned ABOVE the grid so it never hides the maze)
    const pad = 10; const boxW = 250; const boxH = 136;

    // Align to the right edge of the grid where possible
    let legendX = Math.min(cssW - boxW - pad, ox + gw - boxW); legendX = Math.max(pad, legendX);

    // Prefer above the grid; if not enough room, place below; fallback to top padding
    let legendY = oy - boxH - 8;
    if (legendY < pad) { legendY = oy + gh + 8; if (legendY + boxH > cssH - pad) legendY = pad; }

    ctx.fillStyle = "rgba(15,22,46,0.9)";
    ctx.fillRect(legendX, legendY, boxW, boxH);
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("A* Pathfinding (g=1, h=Manhattan)", legendX + 10, legendY + 18);

    const legendItems = [
      ["Frontier (open)", "rgba(80,140,255,0.35)"],
      ["Explored (closed)", "rgba(0,0,0,0.08)"],
      ["Current", "#ff9f1a"],
      ["Path", "#ffd166"],
      ["Start", "#00d084"],
      ["Goal", "#ef476f"],
      ["Walls", "#0b0b0f"],
    ];

    let ly = legendY + 38;
    for (const [label, color] of legendItems) {
      ctx.fillStyle = color; ctx.fillRect(legendX + 10, ly - 10, 18, 18);
      ctx.fillStyle = "#e6e9ef"; ctx.fillText(label, legendX + 36, ly + 3);
      ly += 20;
    }

    // Details (placed with the legend) — define once and reuse
    const engInfoY = ly + 4;
    ctx.fillStyle = "#aab1c3";
    const cur = engineRef.current.current; let g = 0, h = 0, f = 0;
    if (cur >= 0) { g = engineRef.current.g[cur]; h = engineRef.current.hScore[cur]; f = engineRef.current.f[cur]; }
    ctx.fillText(
      `Iter: ${engineRef.current.iter}   Open: ${engineRef.current.open.length}   ` +
        (engineRef.current.finished ? (engineRef.current.success ? "Status: ✓ Goal Reached" : "Status: ✗ No Path") : "Status: Searching…"),
      legendX + 10, engInfoY
    );
    ctx.fillText(
      cur >= 0 ? `Current f=g+h: ${f.toFixed(0)} = ${g.toFixed(0)} + ${h.toFixed(0)}` : "",
      legendX + 10, engInfoY + 18
    );

    ctx.restore();
  }

  // Canvas interaction: toggle walls when paused
  function onCanvasClick(e) {
    if (running || !engineRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const { cell, ox, oy } = layout;
    const gx = Math.floor((x - ox) / cell); const gy = Math.floor((y - oy) / cell);
    if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) return;
    const i = gy * gridW + gx; const start = 0; const goal = gridW * gridH - 1;
    if (i === start || i === goal) return;

    // toggle
    const walls = engineRef.current.obstacles.slice(); walls[i] = walls[i] ? 0 : 1;

    // rebuild engine (preserve seed text, but pause)
    const eng = new AStarEngine(gridW, gridH, walls);
    setEngine(eng); engineRef.current = eng; setRunning(false);
  }

  // Controls
  function handleStep() { if (!engineRef.current || engineRef.current.finished) return; engineRef.current.step(); }
  function handleReset() { regenerate(); setRunning(false); }

  return (
    <div className="w-full min-h-[620px] bg-slate-950 text-slate-100 flex flex-col items-center justify-start gap-3 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">A* Pathfinding Demo (16:9 Grid)</h1>

      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-[1400px]">
        {/* Controls */}
        <div className="lg:basis-[440px] xl:basis-[520px] grow-0 shrink-0 bg-slate-900/60 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={`px-4 py-2 rounded-xl shadow active:scale-95 transition ${running ? "bg-rose-600" : "bg-emerald-600"}`}
              onClick={() => setRunning((r) => !r)}
            >
              {running ? "Pause" : "Play"}
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-sky-600 shadow active:scale-95 transition"
              onClick={handleStep}
              disabled={running}
              title={running ? "Pause to step manually" : "Step one expansion"}
            >
              Step
            </button>
            <button className="px-4 py-2 rounded-xl bg-slate-700 shadow active:scale-95 transition" onClick={handleReset}>Reset</button>
            <button className="px-4 py-2 rounded-xl bg-indigo-600 shadow active:scale-95 transition" onClick={() => setSeed((s) => s + "#")} title="Tweak seed and regenerate">Regenerate</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <div className="bg-slate-800/60 rounded-xl p-3 space-y-1">
              <label className="text-sm opacity-90">Speed (steps/sec): {speed}</label>
              <input type="range" min={1} max={30} value={speed} onChange={(e) => setSpeed(parseInt(e.target.value))} className="w-full" />
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 space-y-1">
              <label className="text-sm opacity-90">Obstacle density: {Math.round(density * 100)}%</label>
              <input type="range" min={0} max={0.45} step={0.01} value={density} onChange={(e) => setDensity(parseFloat(e.target.value))} className="w-full" />
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 space-y-1">
              <label className="text-sm opacity-90">Seed</label>
              <input type="text" className="w-full rounded-lg bg-slate-900 px-3 py-2" value={seed} onChange={(e) => setSeed(e.target.value)} />
              <p className="text-xs text-slate-400">Attempts to find solvable layout: {attempts}</p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 space-y-1">
              <label className="text-sm opacity-90">Grid width (16:9 friendly)</label>
              <input type="number" min={16} max={120} value={gridW} onChange={(e) => setGridW(Math.max(16, Math.min(120, parseInt(e.target.value) || 16)))} className="w-full rounded-lg bg-slate-900 px-3 py-2" />
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 space-y-1">
              <label className="text-sm opacity-90">Grid height</label>
              <input type="number" min={9} max={80} value={gridH} onChange={(e) => setGridH(Math.max(9, Math.min(80, parseInt(e.target.value) || 9)))} className="w-full rounded-lg bg-slate-900 px-3 py-2" />
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 space-y-1 flex items-center justify-between">
              <label className="text-sm opacity-90">Guarantee solvable</label>
              <input type="checkbox" checked={guarantee} onChange={(e) => setGuarantee(e.target.checked)} />
            </div>
          </div>

          <div className="text-sm text-slate-300/90 leading-relaxed">
            <p><span className="font-semibold">How to use:</span> Press <span className="text-emerald-400">Play</span> to see A* expand the frontier (blue) while minimizing <span className="font-mono">f = g + h</span> with Manhattan distance. The current node is orange; explored cells are gray; the final path is gold. Pause and click the grid to toggle walls. Start is top-left, goal is bottom-right.</p>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-slate-900/60 rounded-2xl p-3 shadow-lg flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_W * dpr}
            height={CANVAS_H * dpr}
            style={{ width: CANVAS_W, height: CANVAS_H }}
            onClick={onCanvasClick}
            className="rounded-xl border border-slate-800"
          />
        </div>
      </div>

      <footer className="text-xs text-slate-400/80 mt-2">
        g = 1 per move • h = Manhattan (L1) • 4-way movement • Deterministic tie-break on lower h
      </footer>
    </div>
  );
}
