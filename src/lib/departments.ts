/**
 * Setores oficiais e unificação de grafias.
 * "Contabil", "contábil" e "Contábil " são o MESMO setor: agrupamos por uma chave sem acento,
 * sem diferença de maiúsculas e sem espaços extras, exibindo a grafia oficial quando existir.
 */
export const USER_DEPARTMENTS = [
  "Contábil",
  "Departamento Pessoal",
  "Tecnologia",
  "Financeiro",
  "Faturamento",
  "Jurídico",
  "Recepção",
  "Fiscal",
];

/** Chave de comparação: sem acentos, minúscula, espaços colapsados. */
export const departmentKey = (name: string | null | undefined): string =>
  (name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const OFFICIAL = new Map(USER_DEPARTMENTS.map((d) => [departmentKey(d), d]));

/** Grafia canônica: a oficial, se o setor for conhecido; senão o texto original sem espaços extras. */
export function canonicalDepartment(name: string | null | undefined): string {
  const trimmed = (name ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return OFFICIAL.get(departmentKey(trimmed)) ?? trimmed;
}
