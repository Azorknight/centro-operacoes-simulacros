const API_URL = 'http://127.0.0.1:8000'

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  })

  if (!response.ok) {
    let detalhe = ''
    try {
      const corpo = await response.json()
      detalhe = corpo?.detail ? `: ${corpo.detail}` : ''
    } catch {
      // Mantém a mensagem baseada no código HTTP quando a resposta não é JSON.
    }
    throw new Error(`Erro na API ${response.status}${detalhe}`)
  }

  return response.json()
}

// Diagnóstico
export function obterDiagnostico() {
  return request('/diagnostico')
}

// Recursos
export function obterRecursos() {
  return request('/recursos')
}

export function criarRecurso(dados) {
  return request('/recursos', {
    method: 'POST',
    body: JSON.stringify(dados)
  })
}

export function alterarEstadoRecurso(id, estado) {
  return request(`/recursos/${id}/estado`, {
    method: 'PUT',
    body: JSON.stringify({ estado })
  })
}

export function atualizarPosicaoRecurso(id, latitude, longitude) {
  return request(`/recursos/${id}/posicao`, {
    method: 'PUT',
    body: JSON.stringify({ latitude, longitude })
  })
}

export function atribuirOcorrencia(recursoId, ocorrenciaId) {
  return request(`/recursos/${recursoId}/atribuir-ocorrencia/${ocorrenciaId}`, {
    method: 'PUT'
  })
}

export function confirmarChegada(recursoId) {
  return request(`/recursos/${recursoId}/confirmar-chegada`, {
    method: 'PUT'
  })
}

export function obterHistoricoRecurso(id) {
  return request(`/recursos/${id}/historico`)
}

export function libertarRecurso(id) {
  return request(`/recursos/${id}/libertar`, {
    method: 'PUT'
  })
}

// Ocorrências
export function obterOcorrencias() {
  return request('/ocorrencias')
}

export function criarOcorrencia(dados) {
  return request('/ocorrencias', {
    method: 'POST',
    body: JSON.stringify(dados)
  })
}

// Bases
export function obterBases() {
  return request('/bases')
}

// Timeline
export function obterTimeline() {
  return request('/timeline')
}

// Ordens
export function obterOrdens() {
  return request('/ordens')
}

export function criarOrdem(dados) {
  return request('/ordens', {
    method: 'POST',
    body: JSON.stringify(dados)
  })
}

export function alterarEstadoOrdem(id, estado) {
  return request(`/ordens/${id}/estado`, {
    method: 'PUT',
    body: JSON.stringify({ estado })
  })
}

// Missões
export function obterMissoes() {
  return request('/missoes')
}

export function criarMissao(dados) {
  return request('/missoes', {
    method: 'POST',
    body: JSON.stringify(dados)
  })
}

export function obterRecursosMissao(missaoId) {
  return request(`/missoes/${missaoId}/recursos`)
}

export function atribuirRecursoMissao(missaoId, recursoId) {
  return request(`/missoes/${missaoId}/atribuir-recurso/${recursoId}`, {
    method: 'PUT'
  })
}

export function removerRecursoMissao(missaoId, recursoId) {
  return request(`/missoes/${missaoId}/recursos/${recursoId}`, {
    method: 'DELETE'
  })
}

export function alterarEstadoMissao(id, estado) {
  return request(`/missoes/${id}/estado`, {
    method: 'PUT',
    body: JSON.stringify({ estado })
  })
}

export function alterarSituacaoMissao(id, situacao_operacional) {
  return request(`/missoes/${id}/situacao`, {
    method: 'PUT',
    body: JSON.stringify({ situacao_operacional })
  })
}

export function obterNotasMissao(id) {
  return request(`/missoes/${id}/notas`)
}

export function adicionarNotaMissao(id, dados) {
  return request(`/missoes/${id}/notas`, {
    method: 'POST',
    body: JSON.stringify(dados)
  })
}

export function obterEstatisticasMissao(id) {
  return request(`/missoes/${id}/estatisticas`)
}

export function obterTimelineMissao(id) {
  return request(`/missoes/${id}/timeline`)
}

export function concluirMissao(id) {
  return alterarEstadoMissao(id, 'concluida')
}

// Elementos
export function obterElementos() {
  return request('/elementos')
}

export function criarElemento(dados) {
  return request('/elementos', {
    method: 'POST',
    body: JSON.stringify(dados)
  })
}

export function atualizarPosicaoElemento(id, latitude, longitude) {
  return request(`/elementos/${id}/posicao`, {
    method: 'PUT',
    body: JSON.stringify({ latitude, longitude })
  })
}

export function reembarcarElemento(elementoId, recursoId) {
  return request(`/elementos/${elementoId}/reembarcar/${recursoId}`, {
    method: 'PUT'
  })
}

// Relatório
export function obterRelatorio() {
  return request('/relatorio')
}

// Operações
export function obterOperacoes() {
  return request('/operacoes')
}

export function obterOperacoesArquivadas() {
  return request('/operacoes/arquivadas')
}

export function criarOperacao(dados) {
  return request('/operacoes', {
    method: 'POST',
    body: JSON.stringify(dados)
  })
}


export function arquivarOperacao(id) {
  return request(`/operacoes/${id}/arquivar`, {
    method: 'PUT'
  })
}

export function restaurarOperacao(id) {
  return request(`/operacoes/${id}/restaurar`, {
    method: 'PUT'
  })
}

export function eliminarOperacao(id, confirmacao) {
  return request(`/operacoes/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmacao })
  })
}

export function obterOperacaoAtiva() {
  return request('/operacao-ativa')
}

export function ativarOperacao(id) {
  return request(`/operacoes/${id}/ativar`, {
    method: 'POST'
  })
}

export function encerrarOperacao(id) {
  return request(`/operacoes/${id}/encerrar`, { method: 'PUT' })
}

export function reabrirOperacao(id) {
  return request(`/operacoes/${id}/reabrir`, { method: 'PUT' })
}

export function desativarOperacao() {
  return request('/operacao-ativa', {
    method: 'DELETE'
  })
}

// Preparação de recursos participantes
export function obterCatalogoRecursos() {
  return request('/catalogo-recursos')
}

export function criarRecursoCatalogo(dados) {
  return request('/catalogo-recursos', {
    method: 'POST',
    body: JSON.stringify(dados)
  })
}

export function obterRecursosParticipantes(operacaoId) {
  return request(`/operacoes/${operacaoId}/recursos-participantes`)
}

export function adicionarRecursoParticipante(operacaoId, dados) {
  return request(`/operacoes/${operacaoId}/recursos-participantes`, {
    method: 'POST',
    body: JSON.stringify(dados)
  })
}

export function retirarRecursoParticipante(operacaoId, recursoCatalogoId) {
  return request(`/operacoes/${operacaoId}/recursos-participantes/${recursoCatalogoId}`, {
    method: 'DELETE'
  })
}


// Preparação de elementos participantes
export function obterCatalogoElementos() {
  return request('/catalogo-elementos')
}

export function criarElementoCatalogo(dados) {
  return request('/catalogo-elementos', {
    method: 'POST',
    body: JSON.stringify(dados)
  })
}

export function obterElementosParticipantes(operacaoId) {
  return request(`/operacoes/${operacaoId}/elementos-participantes`)
}

export function adicionarElementoParticipante(operacaoId, dados) {
  return request(`/operacoes/${operacaoId}/elementos-participantes`, {
    method: 'POST',
    body: JSON.stringify(dados)
  })
}

export function retirarElementoParticipante(operacaoId, elementoCatalogoId) {
  return request(`/operacoes/${operacaoId}/elementos-participantes/${elementoCatalogoId}`, {
    method: 'DELETE'
  })
}

export function alterarEstadoOcorrencia(id, estado) {
  return request(`/ocorrencias/${id}/estado`, {
    method: 'PUT',
    body: JSON.stringify({ estado })
  })
}

export function obterTimelineOcorrencia(id) {
  return request(`/ocorrencias/${id}/timeline`)
}

export function obterEstatisticasOcorrencia(id) {
  return request(`/ocorrencias/${id}/estatisticas`)
}

// Backups
export function obterBackups() {
  return request('/backups')
}

export function criarBackup() {
  return request('/backups', { method: 'POST' })
}

export function restaurarBackup(nome, confirmacao) {
  return request(`/backups/${encodeURIComponent(nome)}/restaurar`, {
    method: 'POST',
    body: JSON.stringify({ confirmacao })
  })
}

export function eliminarBackup(nome) {
  return request(`/backups/${encodeURIComponent(nome)}`, { method: 'DELETE' })
}

// Objetivos operacionais
export function obterObjetivos(incluirArquivados = false) {
  return request(`/objetivos?incluir_arquivados=${incluirArquivados}`)
}

export function criarObjetivo(dados) {
  return request('/objetivos', { method: 'POST', body: JSON.stringify(dados) })
}

export function atualizarObjetivo(id, dados) {
  return request(`/objetivos/${id}`, { method: 'PUT', body: JSON.stringify(dados) })
}

export function eliminarObjetivo(id) {
  return request(`/objetivos/${id}`, { method: 'DELETE' })
}

export function associarObjetivoMissao(missaoId, objetivoId) {
  return request(`/missoes/${missaoId}/objetivo`, {
    method: 'PUT',
    body: JSON.stringify({ objetivo_id: objetivoId || null })
  })
}

export function obterModelosObjetivo(incluirInativos = false) {
  return request(`/objetivo-modelos?incluir_inativos=${incluirInativos}`)
}

export function criarModeloObjetivo(dados) {
  return request('/objetivo-modelos', { method: 'POST', body: JSON.stringify(dados) })
}

export function atualizarModeloObjetivo(id, dados) {
  return request(`/objetivo-modelos/${id}`, { method: 'PUT', body: JSON.stringify(dados) })
}

export function eliminarModeloObjetivo(id) {
  return request(`/objetivo-modelos/${id}`, { method: 'DELETE' })
}


// Setores operacionais
export function obterSetores(incluirArquivados = false) {
  return request(`/setores?incluir_arquivados=${incluirArquivados}`)
}

export function criarSetor(dados) {
  return request('/setores', { method: 'POST', body: JSON.stringify(dados) })
}

export function atualizarSetor(id, dados) {
  return request(`/setores/${id}`, { method: 'PUT', body: JSON.stringify(dados) })
}

export function eliminarSetor(id) {
  return request(`/setores/${id}`, { method: 'DELETE' })
}

export function associarSetorObjetivo(objetivoId, setorId) {
  return request(`/objetivos/${objetivoId}/setor`, {
    method: 'PUT',
    body: JSON.stringify({ setor_id: setorId || null })
  })
}

export function associarSetorMissao(missaoId, setorId) {
  return request(`/missoes/${missaoId}/setor`, {
    method: 'PUT',
    body: JSON.stringify({ setor_id: setorId || null })
  })
}
