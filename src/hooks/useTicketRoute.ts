import { useCallback, useEffect } from "react";

/**
 * Sincroniza o chamado aberto com a URL (/chamados/:id) usando a History API.
 * O app não usa um roteador; a navegação entre módulos continua por estado.
 *
 *  - abrir um chamado   → pushState  (o botão Voltar do navegador retorna à fila)
 *  - recarregar a página → o id é lido da URL (ver `ticketIdFromPath`)
 *  - fechar              → history.back() quando a entrada foi criada por nós,
 *                          senão apenas troca a URL por "/" (replaceState)
 */
const PATH_RE = /^\/chamados\/([^/?#]+)\/?$/;

export function ticketIdFromPath(pathname: string = typeof window !== "undefined" ? window.location.pathname : "/"): string | null {
  const m = PATH_RE.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export function useTicketRoute(ticketId: string | null, setTicketId: (id: string | null) => void) {
  // estado → URL
  useEffect(() => {
    const current = ticketIdFromPath();
    if (ticketId && current !== ticketId) {
      window.history.pushState({ g7Ticket: true }, "", `/chamados/${encodeURIComponent(ticketId)}`);
    } else if (!ticketId && current) {
      window.history.replaceState(null, "", "/");
    }
  }, [ticketId]);

  // URL → estado (botão Voltar/Avançar do navegador)
  useEffect(() => {
    const onPop = () => setTicketId(ticketIdFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setTicketId]);

  /** Fecha o chamado, preservando a pilha de histórico do navegador. */
  return useCallback(() => {
    if (window.history.state?.g7Ticket) window.history.back();
    else setTicketId(null);
  }, [setTicketId]);
}
