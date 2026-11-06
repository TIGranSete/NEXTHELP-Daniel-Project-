import type { CSSProperties } from "react";

/**
 * GRAN7 MOTION TRANSITION — Corporate Edition.
 * Todos os ajustes visuais da transição Login → Interface interna ficam aqui.
 * Tempos em ms; as fases se sobrepõem (formulário sai, a cena mergulha em zoom, a interface assenta),
 * então o total é ~0,85 s. Só transform/opacity nas camadas grandes, para manter a fluidez.
 */
export const AUTH_TRANSITION = {
  /** Saída do formulário (opacidade + blur + zoom + deslocamento). */
  FORM_EXIT_MS: 300,
  /** Blur máximo (px) aplicado ao formulário na saída. */
  EXIT_BLUR: 6,
  /** Zoom final do formulário (1 = sem zoom). */
  EXIT_SCALE: 1.1,
  /** Deslocamento horizontal do formulário na saída (px; negativo = esquerda). */
  EXIT_TRANSLATE_X: -14,

  /** Zoom de câmera da cena inteira do login (1 = sem zoom). É o efeito principal. */
  ZOOM_SCALE: 1.7,
  /** Duração do mergulho; o fundo dissolve na parte final dele. */
  ZOOM_MS: 820,
  /** Zoom extra do número 7 (paralaxe), somado ao da cena. */
  SEVEN_DEPTH_SCALE: 1.25,

  /** Faixa de luz verde que atravessa a tela. */
  GREEN_GLOW_OPACITY: 0.42,
  GLOW_SWEEP_MS: 820,

  /** Entrada da interface interna: chega de um zoom-in leve e assenta em 1. */
  ENTRANCE_DELAY_MS: 240,
  ENTRANCE_DURATION_MS: 540,
  ENTRANCE_SCALE: 1.08,
  ENTRANCE_BLUR: 5,
  ENTRANCE_TRANSLATE_Y: 8,

  /** Curvas (suaves, sem "degraus"): in-out para o mergulho, out-expo para a entrada. */
  EASE: "cubic-bezier(0.45, 0, 0.15, 1)",
  EASE_OUT: "cubic-bezier(0.16, 1, 0.3, 1)",

  /** Verde institucional da logo (mesmo valor usado no LoginBackdrop). */
  GREEN_RGB: "113,183,57",
} as const;

const T = AUTH_TRANSITION;

/** Duração total até desmontar a tela de login (a última fase + folga). */
export const TRANSITION_DURATION =
  Math.max(T.ZOOM_MS, T.ENTRANCE_DELAY_MS + T.ENTRANCE_DURATION_MS, T.GLOW_SWEEP_MS) + 40;

/**
 * Decide se a transição roda e devolve as variáveis CSS (intensidade adaptada ao dispositivo).
 * Retorna null para movimento reduzido → troca de tela imediata, como antes.
 */
export function resolveAuthFx(): CSSProperties | null {
  if (typeof window === "undefined") return null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;

  const mobile = window.innerWidth < 640;
  const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4;

  // Mobile: zoom/efeitos mais leves. Baixo desempenho: sem filtros (blur custa caro).
  const k = (v: number) => (mobile ? 1 + (v - 1) * 0.7 : v);
  const blur = lowEnd ? 0 : mobile ? Math.round(T.EXIT_BLUR * 0.6) : T.EXIT_BLUR;
  const enterBlur = lowEnd ? 0 : mobile ? Math.round(T.ENTRANCE_BLUR * 0.5) : T.ENTRANCE_BLUR;
  const tx = mobile ? 0 : T.EXIT_TRANSLATE_X;
  const glow = mobile ? T.GREEN_GLOW_OPACITY * 0.6 : T.GREEN_GLOW_OPACITY;

  return {
    "--g7-form-ms": `${T.FORM_EXIT_MS}ms`,
    "--g7-blur": `${blur}px`,
    "--g7-scale": String(k(T.EXIT_SCALE)),
    "--g7-tx": `${tx}px`,
    "--g7-zoom-ms": `${T.ZOOM_MS}ms`,
    "--g7-zoom-scale": String(k(T.ZOOM_SCALE)),
    "--g7-seven-scale": String(k(T.SEVEN_DEPTH_SCALE)),
    "--g7-glow": String(glow),
    "--g7-glow-ms": `${T.GLOW_SWEEP_MS}ms`,
    "--g7-green": T.GREEN_RGB,
    "--g7-enter-delay": `${T.ENTRANCE_DELAY_MS}ms`,
    "--g7-enter-ms": `${T.ENTRANCE_DURATION_MS}ms`,
    "--g7-enter-blur": `${enterBlur}px`,
    "--g7-enter-scale": String(k(T.ENTRANCE_SCALE)),
    "--g7-enter-ty": `${T.ENTRANCE_TRANSLATE_Y}px`,
    "--g7-ease": T.EASE,
    "--g7-ease-out": T.EASE_OUT,
  } as CSSProperties;
}
