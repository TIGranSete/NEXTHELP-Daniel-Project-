import React, { useEffect, useRef, useState } from "react";
import type { StatusSlice, StatusKey, TrendPoint } from "../../lib/sla/dashboardData";

/** Largura do elemento (para o gráfico se ajustar a qualquer tela sem rolagem horizontal). */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => setW(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ───────────────────────── tendência (linhas) ─────────────────────────

const H = 262;
const M = { l: 40, r: 14, t: 12, b: 28 };

/** Tendência: resolução (verde) e primeira resposta (azul). Intervalos sem dados ficam como lacuna, nunca 0%/100%. */
export function TrendChart({ points, height = H }: { points: TrendPoint[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = Math.max(width, 280);
  const innerW = w - M.l - M.r;
  const innerH = height - M.t - M.b;

  const values = points.flatMap((p) => [p.resolution.pct, p.firstResponse.pct]).filter((v): v is number => v !== null);
  const minV = values.length ? Math.min(...values) : 0;
  // eixo adaptativo (sempre rotulado) para a variação ficar legível; nunca passa de 100
  const rawMin = Math.max(0, minV - 5);
  const step = 100 - rawMin > 60 ? 25 : 100 - rawMin > 25 ? 10 : 5;
  const yMin = Math.floor(rawMin / step) * step;
  const ticks: number[] = [];
  for (let v = yMin; v <= 100; v += step) ticks.push(v);

  const x = (i: number) => M.l + (points.length <= 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (v: number) => M.t + innerH - ((v - yMin) / (100 - yMin)) * innerH;

  const segments = (get: (p: TrendPoint) => number | null) => {
    const out: { i: number; v: number }[][] = [];
    let cur: { i: number; v: number }[] = [];
    points.forEach((p, i) => {
      const v = get(p);
      if (v === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push({ i, v });
    });
    if (cur.length) out.push(cur);
    return out;
  };
  const path = (seg: { i: number; v: number }[]) => seg.map((s, k) => `${k ? "L" : "M"}${x(s.i).toFixed(1)},${y(s.v).toFixed(1)}`).join(" ");
  const area = (seg: { i: number; v: number }[]) => `${path(seg)} L${x(seg[seg.length - 1].i).toFixed(1)},${(M.t + innerH).toFixed(1)} L${x(seg[0].i).toFixed(1)},${(M.t + innerH).toFixed(1)} Z`;

  const resSegs = segments((p) => p.resolution.pct);
  const frSegs = segments((p) => p.firstResponse.pct);
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 58))));
  const showDots = points.length <= 45;

  const idxFromEvent = (clientX: number, el: Element) => {
    const rect = el.getBoundingClientRect();
    const rel = ((clientX - rect.left) / rect.width) * w - M.l;
    return Math.min(points.length - 1, Math.max(0, Math.round((rel / innerW) * (points.length - 1))));
  };
  const hp = hover !== null ? points[hover] : null;
  const fmtRate = (r: TrendPoint["resolution"]) => (r.pct === null ? "sem dados" : `${r.pct}% (${r.met} de ${r.evaluated})`);

  return (
    <div ref={ref} className="relative w-full" data-testid="sla-trend">
      <svg
        width={w}
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        className="block max-w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded-lg"
        role="img"
        tabIndex={0}
        aria-label={`Tendência do SLA: ${points.length} intervalos. Use as setas para ler os valores.`}
        onPointerMove={(e) => setHover(idxFromEvent(e.clientX, e.currentTarget))}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
          else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? points.length) - 1));
          else if (e.key === "Escape") setHover(null);
        }}
        onBlur={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} className="stroke-zinc-300/60 dark:stroke-zinc-700/60" strokeDasharray={t === yMin ? undefined : "3 4"} />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="fill-zinc-600 dark:fill-zinc-400" fontSize="11">{t}%</text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 ? (
            <text key={p.key} x={x(i)} y={height - 8} textAnchor="middle" className="fill-zinc-600 dark:fill-zinc-400" fontSize="11">{p.label}</text>
          ) : null,
        )}
        {resSegs.filter((s) => s.length > 1).map((s, k) => <path key={`a${k}`} d={area(s)} className="fill-emerald-500/10" />)}
        {frSegs.filter((s) => s.length > 1).map((s, k) => <path key={`b${k}`} d={area(s)} className="fill-sky-500/10" />)}
        {resSegs.filter((s) => s.length > 1).map((s, k) => <path key={`r${k}`} d={path(s)} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-emerald-500" />)}
        {frSegs.filter((s) => s.length > 1).map((s, k) => <path key={`f${k}`} d={path(s)} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-sky-500" />)}
        {(showDots || hover !== null) && (
          <>
            {resSegs.flat().map((s) => (showDots || s.i === hover) && <circle key={`rc${s.i}`} cx={x(s.i)} cy={y(s.v)} r={s.i === hover ? 4.5 : 2.8} className="fill-white stroke-emerald-500 dark:fill-zinc-900" strokeWidth="2" />)}
            {frSegs.flat().map((s) => (showDots || s.i === hover) && <circle key={`fc${s.i}`} cx={x(s.i)} cy={y(s.v)} r={s.i === hover ? 4.5 : 2.8} className="fill-white stroke-sky-500 dark:fill-zinc-900" strokeWidth="2" />)}
          </>
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + innerH} className="stroke-zinc-400/60" strokeDasharray="2 3" />}
      </svg>

      {hp && hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-20 top-2 w-52 rounded-lg border border-default bg-surface shadow-raised p-2.5 text-[11.5px] leading-snug"
          style={{ left: Math.min(Math.max(x(hover) - 104, 4), Math.max(4, w - 212)) }}
        >
          <div className="font-semibold text-primary mb-1">{hp.fullLabel}</div>
          <div className="flex items-start gap-1.5 text-secondary"><span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />Resolução: <strong className="text-primary">{fmtRate(hp.resolution)}</strong></div>
          <div className="flex items-start gap-1.5 text-secondary"><span className="mt-1 h-2 w-2 rounded-full bg-sky-500 shrink-0" />1ª resposta: <strong className="text-primary">{fmtRate(hp.firstResponse)}</strong></div>
        </div>
      )}

      {/* alternativa textual do gráfico (leitores de tela) */}
      <table className="sr-only">
        <caption>Cumprimento de SLA por intervalo</caption>
        <thead><tr><th>Intervalo</th><th>Resolução</th><th>Primeira resposta</th></tr></thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}><td>{p.fullLabel}</td><td>{fmtRate(p.resolution)}</td><td>{fmtRate(p.firstResponse)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────── rosca (situação dos chamados) ─────────────────────────

export const STATUS_STYLE: Record<StatusKey, { dot: string; stroke: string }> = {
  resolved_on_time: { dot: "bg-emerald-500", stroke: "stroke-emerald-500" },
  resolved_late: { dot: "bg-rose-400", stroke: "stroke-rose-400" },
  resolved_unrated: { dot: "bg-zinc-400", stroke: "stroke-zinc-400" },
  reopened: { dot: "bg-violet-500", stroke: "stroke-violet-500" },
  waiting: { dot: "bg-yellow-400", stroke: "stroke-yellow-400" },
  overdue: { dot: "bg-red-700", stroke: "stroke-red-700" },
  at_risk: { dot: "bg-orange-500", stroke: "stroke-orange-500" },
  in_progress: { dot: "bg-sky-500", stroke: "stroke-sky-500" },
  pending: { dot: "bg-zinc-300 dark:bg-zinc-600", stroke: "stroke-zinc-300 dark:stroke-zinc-600" },
};

/** Rosca: fatias mutuamente exclusivas; o centro mostra o total (= soma das fatias). */
export function StatusDonut({ slices, total, maxWidth = 168 }: { slices: StatusSlice[]; total: number; maxWidth?: number }) {
  const R = 44;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="w-full h-auto shrink-0" style={{ maxWidth }} role="img" aria-label={`Situação dos ${total} chamados: ${slices.map((s) => `${s.label} ${s.count}`).join(", ")}`}>
      <circle cx="60" cy="60" r={R} fill="none" strokeWidth="16" className="stroke-zinc-200 dark:stroke-zinc-800" />
      {slices.map((s) => {
        const frac = (s.count / total) * 100;
        const el = (
          <circle
            key={s.key}
            cx="60" cy="60" r={R} fill="none" strokeWidth="16" pathLength={100}
            strokeDasharray={`${Math.max(frac - (slices.length > 1 ? 0.6 : 0), 0.01)} ${100 - frac + (slices.length > 1 ? 0.6 : 0)}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
            className={`${STATUS_STYLE[s.key].stroke} transition-[stroke-dasharray] duration-300`}
          />
        );
        offset += frac;
        return el;
      })}
      <text x="60" y="58" textAnchor="middle" className="fill-zinc-900 dark:fill-zinc-50" fontSize="20" fontWeight="700">{total}</text>
      <text x="60" y="73" textAnchor="middle" className="fill-zinc-600 dark:fill-zinc-400" fontSize="9">Total</text>
    </svg>
  );
}
