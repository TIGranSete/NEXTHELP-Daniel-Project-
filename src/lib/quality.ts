/**
 * ESTRUTURA PREPARATÓRIA da futura avaliação gerencial de qualidade (NÃO ativa).
 *
 * Política: o atendimento é analisado em TRÊS camadas independentes:
 *  1. Cumprimento do SLA  — cálculo automático e objetivo (src/lib/sla). Não muda quando o chamado é reaberto.
 *  2. Histórico de reaberturas — eventos auditáveis (autor, motivo, tempo útil de correção).
 *  3. Avaliação de qualidade — análise gerencial contextual, separada do SLA (ESTE arquivo: só tipos).
 *
 * O QUE ESTE ARQUIVO NÃO FAZ (decisão de política, pendente de aprovação):
 *  - não cria campo persistente, nem coluna, nem evento no banco;
 *  - não calcula nota, pontuação ou classificação;
 *  - não atribui avaliação (negativa ou positiva) a técnicos por terem chamados reabertos;
 *  - não gera ranking baseado na quantidade de reaberturas.
 *
 * Quando for aprovada, qualquer avaliação deverá registrar gestor responsável, data, justificativa e
 * HISTÓRICO de alterações (nunca sobrescrever), respeitando permissões — por isso o contrato abaixo já o exige.
 */

/** Estados previstos para uma futura avaliação. Hoje NENHUM chamado possui avaliação. */
export const QUALITY_REVIEW_STATES = [
  { value: "pending", label: "Pendente de avaliação" },
  { value: "adequate", label: "Atendimento adequado" },
  { value: "needs_review", label: "Necessita revisão" },
  { value: "inconclusive", label: "Inconclusivo" },
] as const;

export type QualityReviewState = (typeof QUALITY_REVIEW_STATES)[number]["value"];

/** Uma entrada do histórico da avaliação (contrato futuro; não é gravado em lugar nenhum). */
export interface QualityReviewRecord {
  state: QualityReviewState;
  /** Gestor responsável pela avaliação. */
  reviewedBy: string;
  /** ISO UTC. */
  reviewedAt: string;
  /** Justificativa obrigatória. */
  justification: string;
}

/** Avaliação com histórico completo: cada alteração é uma nova entrada (append-only). */
export interface QualityReview {
  ticketId: string;
  current: QualityReviewRecord;
  history: QualityReviewRecord[];
}

/**
 * Amostra pequena: abaixo disto um percentual NÃO deve receber classificação de desempenho (bom/ruim).
 * Parâmetro de APRESENTAÇÃO provisório (pendente de aprovação); não altera nenhum cálculo de SLA.
 */
export const SMALL_SAMPLE_MIN = 10;

export const isSmallSample = (n: number): boolean => n < SMALL_SAMPLE_MIN;
