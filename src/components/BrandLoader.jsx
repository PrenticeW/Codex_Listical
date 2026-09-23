import { useEffect, useRef, useState } from 'react';
import { PALETTE } from '../utils/staging/projectColour';

/**
 * BrandLoader — the Tacular "T" loading mark, in two stages.
 *
 * Stage 1 (from 0ms): the static mark in its spark pose, ink washing
 * slowly through one palette family's four shades — deep, up to light,
 * back to deep — one full breath in exactly 1.5s. Fast loads show just
 * the logo in a fun colour with a gentle shade drift: calm, deliberate,
 * never a flash of frantic motion.
 *
 * Stage 2 (past 1.5s, only if still loading): the full clock animation.
 * A dot ticks round the eight headings, the corner pills morph between
 * spark and clock, and the T does a revolving-door flip on alternate
 * ticks. The escalation is seamless: the wash lands back on the deep
 * shade at exactly 1.5s — the very colour the ticking starts from — and
 * its first move is the spark pills splitting into the clock pose.
 *
 * All mounted loaders share one clock (module state below), so
 * back-to-back loading screens — auth gate, year metadata, row
 * hydration — read as one continuous animation. The clock re-seeds
 * (new random colour, stages restart) only when a fresh loading
 * sequence begins: no loader mounted within the last 400ms.
 */

// 12 theme families in hue order. All four shade steps (L44/52/60/68) come
// from the app's own PALETTE, so the loader stays in step with the themes.
const FAMILY_NAMES = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'sky', 'blue', 'indigo', 'violet', 'magenta', 'rose'];
const FAMILIES = FAMILY_NAMES.map((name) =>
  [44, 52, 60, 68].map((l) => {
    const step = PALETTE.find((sw) => sw.name === name && sw.l === l);
    return [step.h, step.s, step.l];
  }));

const TICK_MS = 625;        // one tick of the original 5s / 8-tick loop
const HOLD = 0.45;          // fraction of each tick spent at rest
const TICK_START_MS = 1500; // escalate to ticking at 1.5s
const WASH_PERIOD_MS = TICK_START_MS; // one full shade breath = calm stage
const CARDINALS = [0, 90, 180, 270];
const CORNERS = [45, 135, 225, 315];

const lerp = (a, b, t) => a + (b - a) * t;

// Gentle in-out with a small friendly overshoot on arrival.
function softBounce(u) {
  const c1 = 1.0, c2 = c1 * 1.525;
  return u < 0.5
    ? (Math.pow(2 * u, 2) * ((c2 + 1) * 2 * u - c2)) / 2
    : (Math.pow(2 * u - 2, 2) * ((c2 + 1) * (u * 2 - 2) + c2) + 2) / 2;
}
const moveEase = (frac) => (frac < HOLD ? 0 : softBounce((frac - HOLD) / (1 - HOLD)));

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
const STEPS = FAMILIES.map((steps) => steps.map(([h, s, l]) => hslToRgb(h, s, l)));
const RGB = STEPS.map((steps) => steps[0]); // deep step, used by the ticking stage
const at = (i) => RGB[((i % RGB.length) + RGB.length) % RGB.length];
function mixInk(c0, c1, t) {
  const ch = (i) => Math.round(lerp(c0[i], c1[i], t));
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

// ── Shared clock ──
let activeLoaders = 0;
let lastReleaseAt = -Infinity;
let sequenceStart = 0;
let calmIdx0 = 0;

function acquireClock() {
  const now = performance.now();
  if (activeLoaders === 0 && now - lastReleaseAt > 400) {
    sequenceStart = now;
    calmIdx0 = Math.floor(Math.random() * RGB.length);
  }
  activeLoaders += 1;
}

function releaseClock() {
  activeLoaders -= 1;
  lastReleaseAt = performance.now();
}

// Frame state for an elapsed time within the current sequence.
function frameAt(elapsed) {
  if (elapsed < TICK_START_MS) {
    // Calm stage: spark pose, a slow wash through the family's shades —
    // deep -> light -> deep, one cosine breath across the whole stage.
    const steps = STEPS[calmIdx0 % STEPS.length];
    const q = (steps.length - 1) * (1 - Math.cos((2 * Math.PI * elapsed) / WASH_PERIOD_MS)) / 2;
    const i = Math.min(steps.length - 2, Math.floor(q));
    return { morph: 0, dotAngle: 0, flip: 1, ink: mixInk(steps[i], steps[i + 1], q - i) };
  }

  // Ticking stage. relSeg starts at 0 (even) mid-way into its tick, at the
  // start of the move window — so the first thing that happens is the
  // spark→clock morph and the dot leaving north, continuous with stage 1.
  const t = elapsed - TICK_START_MS + HOLD * TICK_MS;
  const relSeg = Math.floor(t / TICK_MS);
  const frac = (t % TICK_MS) / TICK_MS;
  const m = moveEase(frac);
  const morph = relSeg % 2 === 0 ? m : 1 - m;
  const dotAngle = (relSeg % 8) * 45 + 45 * m;
  const flip = relSeg % 2 === 1 ? Math.cos(Math.PI * m) : 1;

  // Colour: continues from the calm family's deep shade (where the wash
  // lands at 1.5s), stepping one family per two ticks, crossfading
  // (linear) during the T-flip move window.
  const idx = calmIdx0 + Math.floor(relSeg / 2);
  const fade = relSeg % 2 === 1 && frac >= HOLD ? (frac - HOLD) / (1 - HOLD) : 0;
  return { morph, dotAngle, flip, ink: mixInk(at(idx), at(idx + 1), fade) };
}

export function BrandLoader({ size = 160 }) {
  const svgRef = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const tGroup = svg.querySelector('[data-t]');
    const dotGroup = svg.querySelector('[data-dot]');
    const fills = svg.querySelectorAll('path, rect, circle');
    const cornerRects = svg.querySelectorAll('[data-corner]'); // 8, in pairs of 2 per corner
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    acquireClock();
    let raf = null;
    const render = () => {
      const { morph, dotAngle, flip, ink } = frameAt(performance.now() - sequenceStart);

      tGroup.setAttribute('transform', `translate(100,100) scale(${0.86 * flip},0.86) translate(-100,-100)`);
      dotGroup.setAttribute('transform', `translate(100,100) rotate(${dotAngle})`);
      fills.forEach((el) => el.setAttribute('fill', ink));
      cornerRects.forEach((rect, i) => {
        const corner = CORNERS[Math.floor(i / 2)];
        const w = lerp(16, 13, morph);
        const len = lerp(28, 20, morph);
        const angle = i % 2 === 0 ? lerp(corner, corner - 15, morph) : lerp(corner, corner + 15, morph);
        rect.setAttribute('x', -w / 2);
        rect.setAttribute('width', w);
        rect.setAttribute('height', len);
        rect.setAttribute('rx', w / 2);
        rect.setAttribute('transform', `rotate(${angle})`);
      });

      if (!reduced) raf = requestAnimationFrame(render);
    };
    render();
    return () => {
      releaseClock();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <svg ref={svgRef} viewBox="0 0 200 200" width={size} height={size} aria-label="Loading" role="img">
      <g data-t transform="translate(100,100) scale(0.86,0.86) translate(-100,-100)">
        <path
          d="M30-450L30-640L1070-640L1070-450L30-450M425 0L425-463L675-463L675 0"
          transform="translate(69.75,117.6) scale(0.055)"
        />
      </g>
      <g data-dot transform="translate(100,100)">
        <circle cx="0" cy="-61" r="8" />
      </g>
      <g transform="translate(100,100)">
        {CARDINALS.map((a) => (
          <rect key={`c${a}`} x={-8} y={-92} width={16} height={39} rx={8} transform={`rotate(${a})`} />
        ))}
        {CORNERS.map((a) => (
          <g key={`g${a}`}>
            <rect data-corner x={-8} y={-92} width={16} height={28} rx={8} transform={`rotate(${a})`} />
            <rect data-corner x={-8} y={-92} width={16} height={28} rx={8} transform={`rotate(${a})`} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * Full-screen loading state for route gates (auth check). Rendered in
 * document flow — it replaces the page while the gate is unresolved.
 */
export function BrandLoaderScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: '#ffffff' }}>
      <BrandLoader size={170} />
    </div>
  );
}

/**
 * Fixed overlay that covers the page while data hydrates, then fades out
 * over the fully-rendered content. Render it unconditionally with
 * `active={!loaded}`: it appears only if it mounts active, and on
 * deactivation it fades (300ms) and unmounts.
 */
export function BrandLoaderOverlay({ active }) {
  const [rendered, setRendered] = useState(active);

  useEffect(() => {
    if (active) { setRendered(true); return undefined; }
    const t = setTimeout(() => setRendered(false), 350);
    return () => clearTimeout(t);
  }, [active]);

  if (!rendered) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#ffffff',
        opacity: active ? 1 : 0,
        transition: 'opacity 300ms ease',
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <BrandLoader size={170} />
    </div>
  );
}

export default BrandLoader;
