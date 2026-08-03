// Em produção, o backend (server.ts) pode estar em um domínio diferente do frontend.
// Configure VITE_API_URL no .env para apontar para o servidor backend correto.
// Exemplo: VITE_API_URL=https://api.gran7help.com
const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

