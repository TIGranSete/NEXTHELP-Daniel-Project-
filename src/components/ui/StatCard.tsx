import React from "react";

export type Tone = "neutral" | "emerald" | "amber" | "rose" | "sky";

export const TONE: Record<Tone, { tile: string; icon: string; value: string; bar: string; chip: string }> = {
  neutral: {
    icon: "bg-surface-2 text-secondary",
    tile: "bg-surface-2 text-secondary border-default",
    value: "text-primary",
    bar: "bg-secondary/50",
    chip: "bg-surface-2 text-secondary border-default",
  },
  emerald: {
    icon: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    tile: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    value: "text-emerald-700 dark:text-emerald-400",
    bar: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  },
  amber: {
    icon: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    tile: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
    value: "text-amber-700 dark:text-amber-400",
    bar: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
  },
  rose: {
    icon: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    tile: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25",
    value: "text-rose-700 dark:text-rose-400",
    bar: "bg-rose-500",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25",
  },
  sky: {
    icon: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    tile: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/25",
    value: "text-sky-700 dark:text-sky-400",
    bar: "bg-sky-500",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/25",
  },
};

interface StatCardProps {
  key?: React.Key;
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  /** Texto complementar — só passe quando for um dado real. */
  hint?: string;
  /** 0–100. Renderiza uma barra de apoio; omita quando não houver dado real. */
  progress?: number;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

/** Só situações de alerta (ou sucesso) colorem o número; o resto fica em tom neutro. */
const VALUE_TONED: Tone[] = ["rose", "emerald"];

export default function StatCard({ icon: Icon, label, value, tone = "neutral", hint, progress, onClick, active, className = "" }: StatCardProps) {
  const t = TONE[tone];
  const base =
    "group relative text-left flex flex-col min-w-0 bg-surface border rounded-xl px-4 py-3.5 shadow-card transition-[border-color,box-shadow,background-color] duration-150 " +
    (active ? "border-emerald-500/40 bg-emerald-500/[0.03] " : "border-default ") +
    (onClick ? "cursor-pointer hover:border-secondary/40 hover:shadow-raised " : "") +
    className;

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] leading-tight font-medium text-secondary sm:truncate">{label}</span>
        <span className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center ${t.icon}`}>
          <Icon className="h-[15px] w-[15px]" aria-hidden />
        </span>
      </div>
      <div className={`mt-1.5 font-display text-[1.75rem] font-bold leading-none tracking-tight tabular-nums ${VALUE_TONED.includes(tone) ? t.value : "text-primary"}`}>{value}</div>
      <p className="mt-2 text-xs text-muted truncate">{hint ?? " "}</p>
      {typeof progress === "number" ? (
        <div
          className="mt-2 h-1 rounded-full bg-surface-3 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.max(0, Math.min(100, progress))}
          aria-label={label}
        >
          <div className={`h-full rounded-full transition-[width] duration-500 ${t.bar}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={base}>
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
}
