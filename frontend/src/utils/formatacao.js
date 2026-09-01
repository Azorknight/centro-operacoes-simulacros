export function obterIconeRecurso(tipo) {
  const tipoLower = tipo?.toLowerCase() || ''

  if (tipoLower.includes('ambul')) return '🚑'
  if (tipoLower.includes('bombe')) return '🚒'
  if (tipoLower.includes('pol')) return '🚓'
  if (tipoLower.includes('moto')) return '🏍️'
  if (tipoLower.includes('drone')) return '🚁'

  return '📍'
}

export function obterCorOcorrencia(tipo, estado) {
  const tipoLower = tipo?.toLowerCase() || ''
  const estadoLower = estado?.toLowerCase() || ''

  if (estadoLower.includes('fechada')) return 'green'
  if (tipoLower.includes('incend')) return 'red'
  if (tipoLower.includes('acidente')) return 'orange'
  if (tipoLower.includes('evac')) return 'purple'

  return 'red'
}

export function formatarDuracao(segundos) {
  if (segundos === null || segundos === undefined) return '—'
  const total = Math.max(0, Math.floor(segundos))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export function formatarDataHora(valor) {
  return valor ? new Date(valor).toLocaleString('pt-PT') : '—'
}

export function obterCorSituacaoMissao(situacao, estado) {
  if (estado === 'concluida') return '#16a34a'

  switch (situacao) {
    case 'sob_controlo':
      return '#16a34a'
    case 'estavel':
      return '#eab308'
    case 'complexa':
      return '#ea580c'
    case 'critica':
      return '#dc2626'
    case 'necessita_reforco':
      return '#111827'
    default:
      return '#7c3aed'
  }
}
