import { User } from "../types";

// Dados reais de colaboradores NÃO devem ficar aqui: este arquivo é importado
// pelo código do navegador e qualquer conteúdo aqui vai parar no bundle JS
// público, expondo nomes, e-mails e hashes de senha a qualquer visitante.
//
// A base de usuários reais agora vive em `users-db.json` (raiz do projeto,
// ignorado pelo git), lida apenas pelo servidor (server.ts). O array abaixo
// é só um fallback de emergência para quando o app está 100% offline e nunca
// sincronizou com o servidor/Supabase — mantenha-o vazio ou com dados fictícios.
export const INITIAL_USERS: User[] = [];
