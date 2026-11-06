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
    desktop: { particles: 80, layers: 18 },
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

export default function LoginBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tier = useMemo(getTier, []);
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
    let raf = 0;
    let last = 0;
    const frameGap = tier === "desktop" ? 0 : 1000 / 30; // 30fps on weaker tiers

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
            const dist = Math.hypot(a.dx - b.dx, a.dy - b.dy);
            if (dist < linkDist) {
              ctx.strokeStyle = `rgba(${LOGIN_FX.green},${(1 - dist / linkDist) * 0.09})`;
              ctx.beginPath(); ctx.moveTo(a.dx, a.dy); ctx.lineTo(b.dx, b.dy); ctx.stroke();
            }
          }
        }
      }
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < frameGap) return;
      last = t;
      cur.x += (target.x - cur.x) * 0.06;
      cur.y += (target.y - cur.y) * 0.06;
      root.style.setProperty("--mx", cur.x.toFixed(4));
      root.style.setProperty("--my", cur.y.toFixed(4));
      draw(t);
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
    <div ref={rootRef} className="lbd-root" data-tier={tier} aria-hidden="true">
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
                        src={sevenImg}
                        alt=""
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
