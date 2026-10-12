// Em produção, o Caddy encaminha /api para o backend local do servidor.
// No desenvolvimento, o Vite faz o mesmo encaminhamento.
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')

export function apiUrl(endpoint) {
  return `${API_BASE}/${endpoint.replace(/^\/+/, '')}`
}
