/**
 * Gran7 Workspace Reveal — parâmetros da transição Fila → Detalhes do chamado.
 *
 * Para acelerar/desacelerar a animação inteira, altere SPEED (1 = padrão,
 * 0.5 = 2x mais rápido, 1.5 = 50% mais lenta). Para outros ajustes, edite
 * os valores individuais abaixo. Tudo está em segundos, exceto `pressMs`.
 *
 * Linha do tempo (SPEED = 1, ~0,5 s no total):
 *   0 ms     clique em "Detalhes": a linha sobe 1–2 px e as demais esmaecem
 *   90 ms    o workspace monta; o overlay (cópia da linha) começa a expandir
 *   90–510   overlay desliza/escala até o cabeçalho e some
 *   150–540  cabeçalho → coluna esquerda → chat → atividades entram sobrepostos
 */
const SPEED = 1;

const s = (v: number) => v * SPEED;

export const REVEAL = {
  /** Tempo de "pressão" da linha antes de trocar de tela (ms). */
  pressMs: Math.round(90 * SPEED),
  /** Curva de easing (ease-out suave, sem "elástico"). */
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  /** Overlay que expande da linha até o cabeçalho. */
  expand: { duration: s(0.42) },
  /** Entrada dos painéis do workspace. */
  panel: {
    duration: s(0.34),
    header: { delay: s(0.04), y: 8 },
    left: { delay: s(0.1), x: -14 },
    center: { delay: s(0.14), y: 10, scale: 0.985 },
    right: { delay: s(0.2), x: 14 },
  },
  /** Saída (retorno à fila): mais curta e discreta que a abertura. */
  exit: { duration: s(0.16), scale: 0.992 },
  /** Entrada da fila no retorno. */
  queueIn: { duration: s(0.2), y: 4 },
} as const;
