import React, { useEffect, useMemo, useRef } from "react";
import sevenImg from "../../assets/images/7.png";
import "./login-backdrop.css";

/**
 * Cinematic login backdrop: dark scene, cursor-following light, particle
 * canvas and the Gran7 "7" (original logo artwork) extruded with stacked
 * CSS-3D layers. No WebGL / extra libs: CSS transforms + one 2D canvas.
 *
 * Disable: set VITE_LOGIN_FX=off in .env, or flip LOGIN_FX.enabled below.
 * Speed / size / float period: CSS vars at the top of login-backdrop.css.
 */
export const LOGIN_FX = {
  enabled: import.meta.env.VITE_LOGIN_FX !== "off",
  /** Particle count and 7 extrusion depth (layers) per device tier. */
  tiers: {
    desktop: { particles: 64, layers: 16 },
    tablet: { particles: 45, layers: 9 },
    mobile: { particles: 26, layers: 3 },
  },
  /** 0..1 — how strongly the mouse tilts the 7 / pushes particles. */
  mouseIntensity: 1,
  green: "113,183,57", // #71B739, sampled from the logo
};

type Tier = keyof typeof LOGIN_FX.tiers;

const getTier = (): Tier => {
  const w = window.innerWidth;
  const base: Tier = w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowEnd = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  if (lowEnd && base === "desktop") return "tablet";
  if (lowEnd && base === "tablet") return "mobile";
  return base;
};

interface Particle {
  x: number; y: number; z: number; // z: 0.25 (far) .. 1 (near)
  vx: number; vy: number; r: number; phase: number; glow: boolean;
  ox: number; oy: number; // eased mouse-push offset
  dx: number; dy: number; // last drawn position (for link lines)
}


/**
 * Pré-renderiza (uma única vez) o 7 em poucos tons de verde vivo num canvas, em vez de
 * aplicar `filter` CSS em cada fatia (18 camadas filtradas = muito caro a cada quadro).
 * Tom 0 = face frontal; os demais escurecem com a profundidade. Sem suporte a ctx.filter
 * (Safari antigo) cai para a imagem original.
 */
const TONES = {
  light: [{ b: 1.12, s: 2.1 }, { b: 0.95, s: 1.9 }, { b: 0.82, s: 1.9 }, { b: 0.7, s: 1.8 }],
  dark: [{ b: 1.18, s: 2.0 }, { b: 0.85, s: 1.9 }, { b: 0.62, s: 1.8 }, { b: 0.45, s: 1.7 }],
};

function useTonedSevens(light: boolean): string[] | null {
  const [urls, setUrls] = React.useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const k = Math.min(1, 900 / img.naturalHeight);
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const out: string[] = [];
      for (const t of TONES[light ? "light" : "dark"]) {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const g = c.getContext("2d");
        if (!g || !("filter" in g)) { setUrls(null); return; }
        g.filter = `brightness(${t.b}) saturate(${t.s})`;
        g.drawImage(img, 0, 0, w, h);
        out.push(c.toDataURL("image/png"));
      }
      setUrls(out);
    };
    img.src = sevenImg;
    return () => { cancelled = true; };
  }, [light]);
  return urls;
}

export default function LoginBackdrop({ light = false }: { light?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tier = useMemo(getTier, []);
  const toned = useTonedSevens(light);
  const { particles: particleCount, layers } = LOGIN_FX.tiers[tier];
  // Skip 3D extrusion if the browser can't do preserve-3d.
  const layerCount = useMemo(
    () => (typeof CSS !== "undefined" && CSS.supports("transform-style", "preserve-3d") ? layers : 1),
    [layers]
  );

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const intensity = LOGIN_FX.mouseIntensity * (tier === "mobile" ? 0.5 : 1);
    let w = 0, h = 0, dpr = 1;
    let parts: Particle[] = [];
    const target = { x: 0, y: 0 }; // -1..1
    const cur = { x: 0, y: 0 };
    const mouse = { x: -9999, y: -9999 };
    const links = tier !== "mobile";
    const linkDist = 112;
    const linkDist2 = linkDist * linkDist;
    let raf = 0;
    let last = 0;
    // Transforms escritos direto nos 3 elementos que reagem ao mouse (sem custom properties na raiz,
    // que forçariam recalcular o estilo de toda a árvore a cada quadro).
    const tiltEl = root.querySelector<HTMLElement>(".lbd-tilt");
    const lightEl = root.querySelector<HTMLElement>(".lbd-light");
    const gridEl = root.querySelector<HTMLElement>(".lbd-grid");
    const cs = getComputedStyle(root);
    const restY = parseFloat(cs.getPropertyValue("--lbd-rest-y")) || -30;
    const restX = parseFloat(cs.getPropertyValue("--lbd-rest-x")) || 8;
    const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
    const frameGap = tier === "desktop" ? 0 : 1000 / 30; // partículas a 30fps nas faixas fracas (o tilt segue a 60fps)
    let lastDraw = 0;
    let lastMx = NaN, lastMy = NaN;

    const seed = () => {
      parts = Array.from({ length: particleCount }, () => {
        const z = 0.25 + Math.random() * 0.75;
        return {
          x: Math.random() * w, y: Math.random() * h, z,
          vx: (Math.random() - 0.5) * 0.12 * z, vy: -(0.03 + Math.random() * 0.12) * z,
          r: (0.6 + Math.random() * 1.4) * z, phase: Math.random() * Math.PI * 2,
          glow: Math.random() < 0.18, ox: 0, oy: 0, dx: 0, dy: 0,
        };
      });
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = root.clientWidth; h = root.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      draw(0);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        if (!reduced) {
          p.x += p.vx; p.y += p.vy;
          if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
          if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        }
        // soft push away from the cursor, eased back when it leaves
        const px = p.x + cur.x * p.z * 26 * intensity, py = p.y + cur.y * p.z * 18 * intensity;
        const dx = px - mouse.x, dy = py - mouse.y, d = Math.hypot(dx, dy);
        const push = d < 150 ? (1 - d / 150) * 28 * intensity : 0;
        p.ox += ((d > 0 ? (dx / d) * push : 0) - p.ox) * 0.08;
        p.oy += ((d > 0 ? (dy / d) * push : 0) - p.oy) * 0.08;
        const tw = 0.55 + 0.45 * Math.sin(t / 1400 + p.phase);
        const a = (0.15 + 0.5 * p.z) * tw;
        const x = px + p.ox, y = py + p.oy;
        p.dx = x; p.dy = y;
        // particles near the cursor get brighter and slightly larger
        const boost = d < 240 ? 1 - d / 240 : 0;
        ctx.fillStyle = `rgba(${LOGIN_FX.green},${Math.min(0.85, a + boost * 0.3)})`;
        ctx.beginPath(); ctx.arc(x, y, p.r + boost * 0.6, 0, Math.PI * 2); ctx.fill();
        if (p.glow) {
          ctx.fillStyle = `rgba(${LOGIN_FX.green},${a * 0.18})`;
          ctx.beginPath(); ctx.arc(x, y, p.r * 5, 0, Math.PI * 2); ctx.fill();
        }
      }
      // faint constellation lines between nearby particles (skipped on mobile)
      if (links) {
        ctx.lineWidth = 1;
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i], b = parts[j];
            const ddx = a.dx - b.dx, ddy = a.dy - b.dy;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < linkDist2) {
              ctx.strokeStyle = `rgba(${LOGIN_FX.green},${(1 - Math.sqrt(d2) / linkDist) * 0.09})`;
              ctx.beginPath(); ctx.moveTo(a.dx, a.dy); ctx.lineTo(b.dx, b.dy); ctx.stroke();
            }
          }
        }
      }
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      // suavização independente de FPS (antes dependia da taxa de quadros)
      const dt = Math.min(64, t - last || 16);
      last = t;
      const k = 1 - Math.exp(-dt / 140);
      cur.x += (target.x - cur.x) * k;
      cur.y += (target.y - cur.y) * k;
      if (Math.abs(target.x - cur.x) > 0.0005 || Math.abs(target.y - cur.y) > 0.0005 || cur.x !== lastMx || cur.y !== lastMy) {
        if (tiltEl) tiltEl.style.transform = `rotateX(${(restX + cur.y * -5).toFixed(3)}deg) rotateY(${(restY + cur.x * 9).toFixed(3)}deg)`;
        if (lightEl) lightEl.style.transform = `translate3d(${(cur.x * 12 * vmin).toFixed(2)}px, ${(cur.y * 9 * vmin).toFixed(2)}px, 0)`;
        if (gridEl) gridEl.style.transform = `translate3d(${(cur.x * -8).toFixed(2)}px, ${(cur.y * -8).toFixed(2)}px, 0)`;
        lastMx = cur.x; lastMy = cur.y;
      }
      if (t - lastDraw >= frameGap) { lastDraw = t; draw(t); }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      target.x = (e.clientX / window.innerWidth - 0.5) * 2 * intensity;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2 * intensity;
      mouse.x = e.clientX; mouse.y = e.clientY;
    };
    const onLeave = () => { target.x = 0; target.y = 0; mouse.x = mouse.y = -9999; };

    const start = () => { if (!raf && !reduced) raf = requestAnimationFrame(tick); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVisibility = () => {
      const hidden = document.hidden;
      root.dataset.paused = String(hidden);
      hidden ? stop() : start();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(root);
    resize();
    if (!reduced) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tier, particleCount]);

  if (!LOGIN_FX.enabled) return null;

  return (
    <div ref={rootRef} className={`lbd-root${light ? " lbd-root--light" : ""}`} data-tier={tier} aria-hidden="true">
      <div className="lbd-light" />
      <div className="lbd-grid" />
      <canvas ref={canvasRef} className="lbd-canvas" />
      <div className="lbd-fx">
        <div className="lbd-halo" />
        <div className="lbd-rays" />
        <div className="lbd-ring" />
        <div className="lbd-ring lbd-ring--b" />
        <div className="lbd-pulse" />
      </div>
      <div className="lbd-stage" style={{ ["--lbd-7-url" as string]: `url(${sevenImg})` } as React.CSSProperties}>
        <div className="lbd-anchor">
          <div className="lbd-tilt">
            <div className="lbd-rotor">
              <div className="lbd-radius">
                <div className="lbd-float">
                  <div className="lbd-seven">
                    {Array.from({ length: layerCount }, (_, i) => (
                      <img
                        key={i}
                        src={toned ? toned[Math.min(toned.length - 1, Math.floor((i / Math.max(1, layerCount)) * toned.length))] : sevenImg}
                        alt=""
                        decoding="async"
                        draggable={false}
                        className="lbd-layer"
                        style={{ ["--i" as string]: i } as React.CSSProperties}
                      />
                    ))}
                    {layerCount > 1 && <div className="lbd-face" />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
