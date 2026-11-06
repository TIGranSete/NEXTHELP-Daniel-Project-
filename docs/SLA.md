# SLA em horas úteis — política, implementação e persistência

Documento técnico do motor único de SLA do Gran7 Help (`src/lib/sla/`). Usado pelo servidor e pelo front-end.

## 1. Política aprovada

| Item | Valor |
|---|---|
| Dias | segunda a sexta |
| Expediente | 07:42–12:00 e 13:30–18:00 (528 min úteis/dia) |
| Fuso | `America/Bahia` (timestamps guardados em UTC) |
| Primeira resposta / resolução (min úteis) | Crítica 15/120 · Alta 30/240 · Média 120/480 · Baixa 240/960 |
| Prioridade "Urgente" no sistema | corresponde a "Crítica" no SLA (valores gravados não foram alterados) |
| Mudança de prioridade (opção A) | mantém o tempo útil consumido e compara com a meta nova; não reinicia; violações anteriores permanecem |
| Classificação inicial (triagem local / IA) | é a definição da prioridade, **não** uma alteração; sugestão e adoção ficam registradas |
| Reabertura | **não** reinicia o SLA original; exige categoria + justificativa; cada ciclo tem tempo de correção próprio |
| Categorias de reabertura | ajuste complementar · problema original não resolvido · problema recorrente · outro |
| Pausa | só "Aguardando Solicitante" (técnico, com motivo); só a resolução é pausada |

**Feriados:** a lista não foi aprovada. `holidays` está vazio e o motor **não desconta feriados** até que sejam cadastrados em `src/lib/sla/config.ts` (`holidays`, `closedDays` ou `exceptions`).

## 2. Vigência

`SLA_POLICY.activatedAt` é `null`: a política **ainda não está ativada em produção**. Enquanto for `null`:

- todos os cálculos aparecem como **pré-visualização** (selo no painel e nota na Análise de SLA);
- nada é recalculado nem gravado retroativamente.

Para ativar (somente após aprovação e deploy): definir `activatedAt` com o instante ISO (UTC) da ativação. Então:

- chamados criados **antes** viram `era: "legacy"`: registros preservados, **fora** dos indicadores (contados como "anteriores à vigência");
- chamados criados depois são `era: "new"`;
- chamados resolvidos sem data confiável ficam "dados insuficientes" e não entram nos percentuais.

O `slaLimit` (horas corridas) continua sendo gravado por compatibilidade e **não decide mais** atraso, urgência ou vencimento exibido.

## 3. Como o SLA é calculado

- **Relógio:** começa na abertura; fora do expediente só conta a partir do próximo período útil.
- **Primeira resposta válida:** primeiro comentário de técnico que não seja o solicitante. Não contam IA, sistema, triagem, atribuição ou mudança de status. Nunca é pausada.
- **Resolução (SLA original):** abertura → **primeira** resolução, descontadas apenas as pausas autorizadas (o desconto é feito em minutos úteis, então nada é descontado duas vezes). Na primeira resolução o servidor grava um **snapshot** (prioridade, meta, minutos consumidos, vencimento, resultado e desempenho da primeira resposta); depois disso o resultado nunca é recalculado.
- **Reabertura:** abre um ciclo `reopen → resolve` com tempo de correção (calendário oficial, descontadas pausas do ciclo). Vários ciclos ficam separados.
- **Chamados antigos sem snapshot:** a resolução é derivada do log de status do sistema (marcado como "derivado do histórico"). Sem registro → `no_data`.

### Indicadores (`metrics.ts`)

- Eficiência de resolução = 100 × resolvidos no prazo ÷ resolvidos avaliáveis (primeira resolução, uma vez por chamado; atrasados entram no denominador). Denominador 0 → **Sem dados**.
- Primeira resposta: calculada separadamente.
- Operacionais: abertos vencidos, em risco (≤25% da meta restante), aguardando solicitante, reabertos agora, resolvidos fora do prazo.
- Taxa de reabertura = 100 × chamados distintos reabertos ÷ chamados distintos resolvidos (coorte do período aplicado pela tela). Reaberturas e Resolvido→Fechado não criam novos chamados. Reabertura **não** altera a eficiência do SLA original.

## 4. Persistência dos eventos (`slaEvents`)

### Estrutura existente
Tabela `public.tickets`: colunas fixas + `comments JSONB`. Eventos de SLA vão no array `slaEvents` do chamado (arquivo local `tickets-db-local.json`) e, no Supabase, num meta-comentário `sla-events-meta` dentro de `comments` (mesmo padrão de `attachments-meta`). **Nenhuma coluna nova, nenhuma migração.**

### Riscos do armazenamento por meta-comentário (verificados no código)
1. **RLS aberta:** a política `"Permitir tudo para todos"` (`USING (true)`) e a chave `anon` no navegador permitem que **qualquer cliente** regrave a linha inteira, inclusive o meta-comentário. Não há autorização no banco.
2. **Sobrescrita:** o navegador salva o chamado inteiro com o estado local (`saveTicketToSupabase`); um estado desatualizado pode **apagar** eventos mais novos. Mitigado só parcialmente (o cliente passou a adotar o chamado devolvido pelo servidor após PATCH/comentário).
3. **Last-writer-wins:** não há controle otimista de concorrência na linha.
4. **Sem imutabilidade:** nada impede editar/remover evento antigo.
5. **Serverless:** em Vercel o arquivo local fica em `os.tmpdir()` (efêmero), então a única cópia durável é o Supabase.

### Mitigações já implementadas (sem migração)
- Servidor define `id`, `seq` (1,2,3…) e instante de cada evento; o cliente nunca escolhe datas.
- `unionSlaEvents`: ao reconciliar cópias (arquivo local × Supabase) eventos **nunca são removidos**.
- `verifySlaEvents`: detecta duplicidade, sequência quebrada, eventos retroativos, pausa sobreposta, retomada sem pausa, reabertura sem motivo/categoria, resolução sem snapshot. O painel do chamado e a Análise de SLA sinalizam inconsistências.
- Snapshot gravado na primeira resolução.

### Conclusão
**Não é possível garantir** autorização, imutabilidade e ausência de sobrescritas com o meta-comentário enquanto a RLS permanecer aberta. Ele é adequado para **homologação local**. Para produção recomenda-se a estrutura abaixo (**requer autorização — nada foi executado**).

### Proposta (NÃO executada)
```sql
create table public.ticket_sla_events (
  id         text primary key,
  ticket_id  text not null references public.tickets(id) on delete restrict,
  seq        integer not null,
  type       text not null check (type in ('pause','resume','priority_initial','priority_change','resolve','reopen')),
  at         timestamptz not null,
  actor      text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (ticket_id, seq)
);
alter table public.ticket_sla_events enable row level security;
revoke all on public.ticket_sla_events from anon, authenticated;   -- sem policies: só service_role (servidor)
create function public.ticket_sla_events_immutable() returns trigger language plpgsql as
$$ begin raise exception 'ticket_sla_events é somente de acréscimo'; end $$;
create trigger ticket_sla_events_no_update before update or delete on public.ticket_sla_events
  for each row execute function public.ticket_sla_events_immutable();
```
- **Compatibilidade:** tabela nova; `tickets` não muda. O servidor passa a ler/escrever eventos nela (chave `service_role` já suportada por `supabase-db.ts`) e devolve `slaEvents` montado em `GET /api/tickets`. Período de **escrita dupla** (tabela + meta-comentário) para validar.
- **Riscos:** exige `SUPABASE_SERVICE_ROLE_KEY` no servidor; o navegador deixa de gravar eventos (só o servidor); migração de eventos existentes é um passo à parte, só com autorização.
- **Backup antes:** exportar `tickets` (Supabase → backup/`pg_dump -t public.tickets`) e copiar `tickets-db-local.json`.
- **Reversão:** `drop table public.ticket_sla_events cascade;` e voltar o servidor ao modo meta-comentário (os eventos continuam nos meta-comentários durante a escrita dupla). Nenhuma coluna de `tickets` é alterada, então a reversão não afeta chamados.

## 5. Plano de implantação (resumo)
1. Aprovar tabela de eventos (ou aceitar o risco do meta-comentário) e a lista de feriados.
2. Backup de `tickets` e `tickets-db-local.json`.
3. (Se aprovado) criar a tabela; ativar escrita dupla em homologação.
4. Validar com casos controlados (ver "Validação segura" abaixo) e amostra real **somente leitura**.
5. Deploy; definir `activatedAt`.
6. Reversão: restaurar o deploy anterior (`activatedAt` volta a `null`); dados antigos permanecem intactos.

## 6. Validação segura com dados reais
- `npm test`: 74+ testes unitários com casos controlados.
- Rodar o servidor numa pasta isolada (arquivos de dados são relativos ao diretório de execução) com chamados fictícios.
- Para a base real: exportar `tickets` em modo **somente leitura** para um arquivo e rodar o motor localmente (sem gravar) para comparar a eficiência antiga × nova e listar chamados "dados insuficientes".
