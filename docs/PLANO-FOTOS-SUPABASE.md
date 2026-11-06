# Plano: fotos de perfil persistentes no Supabase (PARA APROVAÇÃO — nada foi executado)

## 1. Situação atual
- A foto fica em `user-photos.json` no disco do servidor (fora da sincronização de usuários). Vale para uso local ou servidor com disco persistente.
- Em hospedagem serverless (Vercel), o arquivo vai para `os.tmpdir()` (efêmero e por instância): **a foto se perde**. Não há bucket de Storage no projeto.
- Já está implementado e testado no servidor: autenticação (`requireAuth`), autorização (`requireTech`), validação de tipo, bytes iniciais e tamanho (`src/lib/photoValidation.ts`).
- Tabela `users`: RLS ligada; `REVOKE ALL` do papel `anon` e `GRANT SELECT` apenas em `id, name, email, department, role, must_change_password`. **Uma coluna nova não fica exposta ao navegador anônimo** (só o servidor a lê).
- O `upsert` de usuário em `supabase-db.ts` grava colunas explícitas; ele **não zera** uma coluna nova ao editar o colaborador.

## 2. Arquitetura proposta
Arquivo no **Storage** (objeto) + **referência** na tabela `users`.

| Peça | Decisão |
|---|---|
| Bucket | `user-avatars`, **privado**, limite 300 KB, MIME `image/jpeg, image/png, image/webp` |
| Caminho do objeto | `users/{userId}/{sha256}.{ext}` (nome por conteúdo: nunca sobrescreve, cache seguro). `userId` validado por `^[A-Za-z0-9_-]+$` |
| Referência | `users.photo_path TEXT NULL` e `users.photo_updated_at TIMESTAMPTZ NULL` (colunas **aditivas**) |
| Quem grava | **Somente o servidor**, com a chave `service_role`. Nenhuma política para `anon`/`authenticated` no bucket ⇒ o navegador não lê nem escreve direto |
| Quem vê | Todo usuário autenticado: o servidor devolve em `GET /api/users` uma **URL assinada** de curta duração (ex.: 1 h) por foto |
| Quem altera | Só `role = tecnico` (mesma checagem `requireTech` já testada), validação no servidor |
| Ordem de gravação | 1) envia o objeto novo 2) atualiza `photo_path` 3) remove o objeto antigo (se falhar o 3, só sobra arquivo órfão; nunca fica referência quebrada) |
| Remoção | `photo_path = NULL` primeiro, depois remove o objeto |
| Alternância | variável `PHOTO_STORAGE=local` (padrão, comportamento de hoje) ou `supabase`. Sem Supabase, continua local |

## 3. Alterações necessárias no Supabase (SQL — NÃO executado)
```sql
-- 1) Colunas aditivas (idempotentes; nada é removido nem reescrito)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS photo_path TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS photo_updated_at TIMESTAMPTZ;

-- 2) Bucket privado com limites
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-avatars', 'user-avatars', false, 307200, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 3) Políticas: NENHUMA para anon/authenticated em storage.objects deste bucket
--    (RLS do Storage nega por padrão; somente a service_role do servidor acessa).
-- 4) GRANTs de public.users permanecem como estão: photo_path NÃO é concedida ao anon.
```
- **Pré-requisito crítico:** o servidor lê a chave em `SUPABASE_KEY` (cai para `SUPABASE_SERVICE_ROLE_KEY`, depois chaves anônimas). Para o Storage privado, `SUPABASE_KEY` precisa ser a **service_role**. Se produção usa a chave anônima hoje, é preciso trocá-la (segredo só no servidor, nunca `VITE_*`).

## 4. Mudanças de código previstas (após aprovação)
- `supabase-db.ts`: `mapUserFromSupabase` lê `photo_path`; funções `uploadAvatar / removeAvatar / signedAvatarUrls`.
- `server.ts`: rotas de foto passam a usar o armazenamento conforme `PHOTO_STORAGE`; `GET /api/users` devolve URL assinada (`photo`) em vez do data URL.
- Cliente: `<img src={photo}>` já funciona com URL (hoje usa data URL); sem mudança de layout.
- Script de migração das fotos locais (`user-photos.json` → bucket) com **modo simulação** (`--dry-run`) e relatório; só roda com autorização.

## 5. Backup, compatibilidade e reversão
- **Antes:** exportar a tabela `users` (CSV do painel ou `pg_dump -t public.users`) e copiar `user-photos.json`.
- **Compatibilidade:** colunas e bucket são novos; chamados, sessões e o restante não mudam. Usuários sem foto continuam com iniciais.
- **Reversão sem perda de dados:** voltar `PHOTO_STORAGE=local`. As colunas e o bucket **permanecem** (sem `DROP COLUMN`, sem apagar objetos). Remoção do bucket/colunas só manualmente e depois de nova autorização.

## 6. Verificação planejada (em homologação, antes de produção)
- 401 sem login; 403 para colaborador (adicionar, trocar, remover); 200 para técnico.
- Recusa de GIF, conteúdo disfarçado, SVG, texto e arquivo acima do limite.
- Foto visível em outro dispositivo/sessão e após reiniciar o servidor.
- Colaborador não consegue acessar o bucket diretamente (navegador com chave anônima ⇒ negado).
- URL assinada expira; foto trocada atualiza a referência; remoção limpa referência e objeto.
- Migração em simulação: contagem de fotos locais × objetos criados.

## 7. Itens que dependem de decisão/aprovação
1. Aprovar o SQL da seção 3 e quem o executa (painel do Supabase).
2. Confirmar que `SUPABASE_KEY` de produção é a `service_role`.
3. Escolher entre URL assinada (recomendado, respeita "só autenticados veem") e bucket público (mais simples, mas qualquer pessoa com o link vê a foto).
4. Prazo de expiração da URL assinada (sugestão: 1 h).
