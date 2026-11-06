import React from "react";
import { TONE, Tone } from "./StatCard";

interface PillProps {
  tone: Tone;
  children: React.ReactNode;
  dot?: boolean;
}

export function Pill({ tone, children, dot = true }: PillProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full border text-xs font-medium whitespace-nowrap ${TONE[tone].chip}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${TONE[tone].bar}`} aria-hidden />}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  Aberto: "amber",
  Pendente: "amber",
  "Em Atendimento": "sky",
  Testando: "sky",
  "Aguardando Solicitante": "amber",
  Resolvido: "emerald",
  Fechado: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return <Pill tone={STATUS_TONE[status] ?? "neutral"}>{status === "Aberto" ? "Pendente" : status}</Pill>;
}

export const PRIORITY_TONE: Record<string, Tone> = {
  Urgente: "rose",
  Alta: "amber",
  Média: "sky",
  Baixa: "neutral",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return <Pill tone={PRIORITY_TONE[priority] ?? "neutral"}>{priority}</Pill>;
}

/** Rótulo de SLA vindo de getSlaEscalation (texto em caixa alta) → tom + texto legível. */
const SLA_MAP: Record<string, { tone: Tone; text: string }> = {
  "CONCLUÍDO": { tone: "emerald", text: "Concluído" },
  ATRASADO: { tone: "rose", text: "Atrasado" },
  "URGÊNCIA": { tone: "amber", text: "Urgência" },
  "ATENÇÃO": { tone: "amber", text: "Atenção" },
  "DENTRO PRAZO": { tone: "emerald", text: "No prazo" },
  "EM RISCO": { tone: "amber", text: "Em risco" },
  PAUSADO: { tone: "sky", text: "Pausado" },
  "SEM SLA": { tone: "neutral", text: "Sem SLA" },
};

export function SlaBadge({ label }: { label: string }) {
  const m = SLA_MAP[label] ?? { tone: "neutral" as Tone, text: label };
  return <Pill tone={m.tone}>{m.text}</Pill>;
}
