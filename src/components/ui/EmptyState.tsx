import React from "react";
import { TONE, Tone } from "./StatCard";

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  tone?: Tone;
  action?: { label: string; onClick: () => void; icon?: React.ElementType };
  secondaryAction?: { label: string; onClick: () => void };
  /** Linhas de esqueleto no lugar do conteúdo (estado de carregamento). */
  busy?: boolean;
}

export default function EmptyState({ icon: Icon, title, description, tone = "neutral", action, secondaryAction, busy }: EmptyStateProps) {
  const ActionIcon = action?.icon;
  return (
    <div className="flex flex-col items-center text-center px-6 py-16" role={tone === "rose" ? "alert" : "status"} aria-busy={busy || undefined}>
      <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${TONE[tone].icon}`}>
        <Icon className={`h-5 w-5 ${busy ? "motion-safe:animate-spin" : ""}`} aria-hidden />
      </span>
      <h3 className="mt-4 text-[15px] font-semibold text-primary font-display">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-secondary">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors duration-150 cursor-pointer"
            >
              {ActionIcon && <ActionIcon className="h-4 w-4" />}
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="h-9 px-4 rounded-lg bg-surface-2 hover:bg-surface-3 border border-default text-primary text-sm font-medium transition-colors cursor-pointer"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
