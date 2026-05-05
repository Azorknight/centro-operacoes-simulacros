import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  CircleMarker,
  Tooltip,
  useMapEvents,
  Polyline,
} from 'react-leaflet'
import L from 'leaflet'
import jsPDF from 'jspdf'

function GestorCliquesMapa() {
  useMapEvents({
    click(e) {
      const isCtrl = e.originalEvent.ctrlKey || e.originalEvent.metaKey

      if (isCtrl) {
        window.dispatchEvent(new CustomEvent('abrir-form-recurso', {
          detail: {
            latitude: e.latlng.lat,
            longitude: e.latlng.lng
          }
        }))
      } else {
        window.dispatchEvent(new CustomEvent('abrir-form-ocorrencia', {
          detail: {
            latitude: e.latlng.lat,
            longitude: e.latlng.lng
          }
        }))
      }
    },
  })

  return null
}

function obterIconeRecurso(tipo) {
  const tipoLower = tipo?.toLowerCase() || ''

  if (tipoLower.includes('ambul')) return '🚑'
  if (tipoLower.includes('bombe')) return '🚒'
  if (tipoLower.includes('pol')) return '🚓'
  if (tipoLower.includes('moto')) return '🏍️'
  if (tipoLower.includes('drone')) return '🚁'

  return '📍'
}

function App() {
  const [recursos, setRecursos] = useState([])
  const [ocorrencias, setOcorrencias] = useState([])
  const [bases, setBases] = useState([])
  const [timeline, setTimeline] = useState([])
  const [ordens, setOrdens] = useState([])
  const [missoes, setMissoes] = useState([])
  const [relatorio, setRelatorio] = useState(null)
  const [mostrarSoAtivos, setMostrarSoAtivos] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState('recursos')
  const [mostrarPainelEsquerdo, setMostrarPainelEsquerdo] = useState(true)
  const [mostrarPainelDireito, setMostrarPainelDireito] = useState(true)
  const [detalhe, setDetalhe] = useState(null)
  const [formRecurso, setFormRecurso] = useState({
    nome: '',
    tipo: ''
  })
  const [posicaoNovoRecurso, setPosicaoNovoRecurso] = useState(null)
  const [formOcorrencia, setFormOcorrencia] = useState({
    titulo: '',
    tipo: '',
    descricao: ''
  })
  const [posicaoNovaOcorrencia, setPosicaoNovaOcorrencia] = useState(null)
  const [formMissao, setFormMissao] = useState({
    titulo: '',
    descricao: '',
    prioridade: 'media',
    ocorrencia_id: null
  })
  const [mostrarFormMissao, setMostrarFormMissao] = useState(false)
  const [missaoParaAtribuir, setMissaoParaAtribuir] = useState(null)
  const [formOrdem, setFormOrdem] = useState({
    titulo: '',
    descricao: '',
    recurso_id: null,
    ocorrencia_id: null
  })

  const [mostrarFormOrdem, setMostrarFormOrdem] = useState(false)
  const [recursoParaAtribuirOcorrencia, setRecursoParaAtribuirOcorrencia] = useState(null)

  const mapRef = useRef()

  useEffect(() => {
    fetch('http://127.0.0.1:8000/recursos')
      .then((res) => res.json())
      .then((data) => setRecursos(data))

    fetch('http://127.0.0.1:8000/ocorrencias')
      .then((res) => res.json())
      .then((data) => setOcorrencias(data))

    fetch('http://127.0.0.1:8000/bases')
      .then((res) => res.json())
      .then((data) => setBases(data))

    fetch('http://127.0.0.1:8000/timeline')
      .then((res) => res.json())
      .then((data) => setTimeline(data))

    fetch('http://127.0.0.1:8000/ordens')
      .then((res) => res.json())
      .then((data) => setOrdens(data))

    fetch('http://127.0.0.1:8000/missoes')
      .then((res) => res.json())
      .then((data) => setMissoes(data))

    fetch('http://127.0.0.1:8000/relatorio')
      .then((res) => res.json())
      .then((data) => setRelatorio(data))

    const abrirFormRecurso = (event) => {
      setPosicaoNovoRecurso(event.detail)
    }

    window.addEventListener('abrir-form-recurso', abrirFormRecurso)

    const abrirFormOcorrencia = (event) => {
      setPosicaoNovaOcorrencia(event.detail)
    }

    window.addEventListener('abrir-form-ocorrencia', abrirFormOcorrencia)

    return () => {
      window.removeEventListener('abrir-form-recurso', abrirFormRecurso)
      window.removeEventListener('abrir-form-ocorrencia', abrirFormOcorrencia)
    }
  }, [])
    
  function mudarEstado(id, novoEstado) {
    fetch(`http://127.0.0.1:8000/recursos/${id}/estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: novoEstado }),
    }).then(() => window.location.reload())
  }

  const recursosFiltrados = useMemo(
    () =>
      recursos.filter(
        (r) =>
          !mostrarSoAtivos ||
          r.estado === 'disponivel' ||
          r.estado === 'em_missao'
      ),
    [recursos, mostrarSoAtivos]
  )

  const ocorrenciasFiltradas = useMemo(
    () => ocorrencias.filter((o) => !mostrarSoAtivos || o.estado !== 'fechada'),
    [ocorrencias, mostrarSoAtivos]
  )

  const missoesFiltradas = useMemo(
    () => missoes.filter((m) => !mostrarSoAtivos || m.estado !== 'concluida'),
    [missoes, mostrarSoAtivos]
  )

  function exportarPdf() {
    if (!relatorio) return

    const doc = new jsPDF()
    const dataAtual = new Date().toLocaleString()

    doc.setFillColor(230, 230, 230)
    doc.rect(0, 0, 210, 35, 'F')

    doc.setFontSize(20)
    doc.text('Centro de Operações e Simulacros', 20, 15)

    doc.setFontSize(16)
    doc.text('Relatório Operacional', 20, 25)

    doc.setFontSize(10)
    doc.text(`Data: ${dataAtual}`, 150, 25)

    doc.line(20, 38, 190, 38)

    doc.setFontSize(14)
    doc.text('Resumo', 20, 50)

    doc.setFontSize(12)
    doc.text('Recursos:', 25, 60)
    doc.text(String(relatorio.recursos), 100, 60)

    doc.text('Ocorrências:', 25, 70)
    doc.text(String(relatorio.ocorrencias), 100, 70)

    doc.text('Ordens:', 25, 80)
    doc.text(String(relatorio.ordens), 100, 80)

    doc.setFontSize(14)
    doc.text('Missões', 20, 100)

    doc.setFontSize(12)
    doc.text('Total:', 25, 110)
    doc.text(String(relatorio.missoes_total), 100, 110)

    doc.text('Ativas:', 25, 120)
    doc.text(String(relatorio.missoes_ativas), 100, 120)

    doc.text('Concluídas:', 25, 130)
    doc.text(String(relatorio.missoes_concluidas), 100, 130)

    doc.setFontSize(10)
    doc.text('Centro de Operações e Simulacros', 20, 145)

    doc.addPage()
    doc.setFontSize(16)
    doc.text('Recursos', 20, 20)
    doc.setFontSize(11)

    let y = 30
    recursos.forEach((r, index) => {
      doc.text(`${index + 1}. ${r.nome} (${r.tipo}) - ${r.estado}`, 20, y)
      y += 8
      if (y > 280) {
        doc.addPage()
        y = 20
      }
    })

    doc.addPage()
    doc.setFontSize(16)
    doc.text('Ocorrências', 20, 20)
    doc.setFontSize(11)

    y = 30
    ocorrencias.forEach((o, index) => {
      doc.text(`${index + 1}. ${o.titulo} (${o.tipo}) - ${o.estado}`, 20, y)
      y += 8
      if (y > 280) {
        doc.addPage()
        y = 20
      }
    })

    doc.addPage()
    doc.setFontSize(16)
    doc.text('Missões', 20, 20)
    doc.setFontSize(11)

    y = 30
    missoes.forEach((m, index) => {
      doc.text(`${index + 1}. ${m.titulo} - ${m.estado}`, 20, y)
      y += 8
      if (y > 280) {
        doc.addPage()
        y = 20
      }
    })

    doc.save('relatorio_operacional.pdf')
  }

  function renderAba() {
    if (abaAtiva === 'recursos') {
      return (
        <>
          <strong style={styles.sectionTitle}>Recursos</strong>
          {recursosFiltrados.map((r) => (
            <div key={r.id} style={styles.itemCard}>
              <div style={styles.itemTitle}>{r.nome}</div>
              <div style={styles.itemMeta}>{r.tipo} · {r.estado}</div>
            </div>
          ))}
        </>
      )
    }

    if (abaAtiva === 'ocorrencias') {
      return (
        <>
          <strong style={styles.sectionTitle}>Ocorrências</strong>
          {ocorrenciasFiltradas.map((o) => (
            <div
              key={o.id}
              style={{ ...styles.itemCard, cursor: 'pointer' }}
              onClick={() => {
                if (o.latitude && o.longitude && mapRef.current) {
                  mapRef.current.setView([o.latitude, o.longitude], 13)
                }
              }}
            >
              <div style={styles.itemTitle}>{o.titulo}</div>
              <div style={styles.itemMeta}>{o.tipo} · {o.estado}</div>
            </div>
          ))}
        </>
      )
    }

    if (abaAtiva === 'ordens') {
      return (
        <>
          <strong style={styles.sectionTitle}>Ordens</strong>
          {ordens.map((o) => (
            <div key={o.id} style={styles.itemCard}>
              <div style={styles.itemTitle}>{o.titulo}</div>
              <div style={styles.itemMeta}>{o.estado}</div>
              <div style={styles.buttonRow}>
                <button
                  style={styles.smallButton}
                  onClick={() => {
                    fetch(`http://127.0.0.1:8000/ordens/${o.id}/estado`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ estado: 'executada' }),
                    }).then(() => window.location.reload())
                  }}
                >
                  Executar
                </button>
                <button
                  style={styles.smallButton}
                  onClick={() => {
                    fetch(`http://127.0.0.1:8000/ordens/${o.id}/estado`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ estado: 'concluida' }),
                    }).then(() => window.location.reload())
                  }}
                >
                  Concluir
                </button>
              </div>
            </div>
          ))}
        </>
      )
    }

    if (abaAtiva === 'missoes') {
      return (
        <>
          <strong style={styles.sectionTitle}>Missões</strong>
          {missoesFiltradas.map((m) => {
            const recurso = recursos.find((r) => r.id === m.recurso_id)

            return (
              <div
                key={m.id}
                style={{ ...styles.itemCard, cursor: 'pointer' }}
                onClick={() => {
                  if (!mapRef.current) return

                  const recursoMapa = recursos.find((r) => r.id === m.recurso_id)
                  const ocorrenciaMapa = ocorrencias.find((o) => o.id === m.ocorrencia_id)

                  if (recursoMapa && recursoMapa.latitude && recursoMapa.longitude) {
                    mapRef.current.setView([recursoMapa.latitude, recursoMapa.longitude], 13)
                  } else if (
                    ocorrenciaMapa &&
                    ocorrenciaMapa.latitude &&
                    ocorrenciaMapa.longitude
                  ) {
                    mapRef.current.setView([ocorrenciaMapa.latitude, ocorrenciaMapa.longitude], 13)
                  }
                }}
              >
                <div style={styles.itemTitle}>
                  {m.titulo} ({m.prioridade})
                </div>
                <div style={styles.itemMeta}>{m.estado}</div>
                {recurso && <div style={styles.itemSubtle}>→ {recurso.nome}</div>}

                <div style={styles.buttonRow}>
                  <button
                    style={styles.smallButton}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMissaoParaAtribuir(m)
                    }}
                  >
                    Atribuir
                  </button>

                  <button
                    style={styles.smallButton}
                    onClick={(e) => {
                      e.stopPropagation()
                      fetch(`http://127.0.0.1:8000/missoes/${m.id}/concluir`, {
                        method: 'PUT',
                      }).then(() => window.location.reload())
                    }}
                  >
                    Concluir
                  </button>
                </div>
              </div>
            )
          })}
        </>
      )
    }

    return (
      <>
        <strong style={styles.sectionTitle}>Timeline</strong>
        {timeline.slice(0, 20).map((t) => {
          let color = '#111827'
          if (t.tipo === 'recurso') color = '#2563eb'
          if (t.tipo === 'ocorrencia') color = '#dc2626'
          if (t.tipo === 'movimento') color = '#16a34a'
          if (t.tipo === 'missao') color = '#7c3aed'
          if (t.tipo === 'ordem') color = '#ea580c'

          return (
            <div key={t.id} style={{ ...styles.itemCard, borderLeft: `4px solid ${color}` }}>
              <div style={{ ...styles.itemMeta, color }}>{t.tipo}</div>
              <div style={styles.itemTitle}>{t.descricao}</div>
            </div>
          )
        })}
      </>
    )
  }

  return (
    <div style={styles.appShell}>
      <div style={styles.topBar}>
        <div style={styles.topBarTitle}>Centro de Operações e Simulacros</div>
        <div style={styles.kpiRow}>
          <div style={styles.kpiBox}>
            <div style={styles.kpiLabel}>Disponíveis</div>
            <div style={styles.kpiValue}>
              {recursos.filter((r) => r.estado === 'disponivel').length}
            </div>
          </div>
          <div style={styles.kpiBox}>
            <div style={styles.kpiLabel}>Em missão</div>
            <div style={styles.kpiValue}>
              {recursos.filter((r) => r.estado === 'em_missao').length}
            </div>
          </div>
          <div style={styles.kpiBox}>
            <div style={styles.kpiLabel}>Ocorrências</div>
            <div style={styles.kpiValue}>{ocorrencias.length}</div>
          </div>
          <div style={styles.kpiBox}>
            <div style={styles.kpiLabel}>Missões ativas</div>
            <div style={styles.kpiValue}>
              {missoes.filter((m) => m.estado !== 'concluida').length}
            </div>
          </div>
          <div style={styles.kpiBox}>
            <div style={styles.kpiLabel}>Ordens</div>
            <div style={styles.kpiValue}>{ordens.length}</div>
          </div>
        </div>
      </div>

      {mostrarPainelEsquerdo && (
        <div style={styles.leftPanel}>
        <div style={styles.panelTitle}>Controlo</div>

        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={mostrarSoAtivos}
            onChange={(e) => setMostrarSoAtivos(e.target.checked)}
          />
          Mostrar só ativos
        </label>

        <div style={styles.helpBox}>
          <div>Click esquerdo: criar ocorrência</div>
          <div>CTRL + Click esquerdo: criar recurso</div>
        </div>

        <div style={styles.reportBox}>
          <div style={styles.sectionTitle}>Resumo</div>
          {relatorio && (
            <div style={styles.reportText}>
              <div>Recursos: {relatorio.recursos}</div>
              <div>Ocorrências: {relatorio.ocorrencias}</div>
              <div>Missões total: {relatorio.missoes_total}</div>
              <div>Missões ativas: {relatorio.missoes_ativas}</div>
              <div>Missões concluídas: {relatorio.missoes_concluidas}</div>
              <div>Ordens: {relatorio.ordens}</div>
            </div>
          )}
          <button style={styles.mainButton} onClick={exportarPdf}>
            Exportar PDF
          </button>
        </div>

        <div style={styles.legendBox}>
          <div style={styles.sectionTitle}>Legenda</div>
          <div>🔵 Recurso normal</div>
          <div>🟡 Ordem emitida</div>
          <div>🟠 Ordem executada</div>
          <div>🔴 Ocorrência</div>
          <div>⚪ Missão planeada</div>
          <div>🟢 Missão concluída</div>
          <div>🔵 Base</div>
        </div>
      </div>
      )}

      {mostrarPainelDireito && (
        <div style={styles.rightPanel}>
        <div style={styles.tabBar}>
          {['recursos', 'ocorrencias', 'missoes', 'ordens', 'timeline'].map((aba) => (
            <button
              key={aba}
              style={{
                ...styles.tabButton,
                ...(abaAtiva === aba ? styles.tabButtonActive : {}),
              }}
              onClick={() => setAbaAtiva(aba)}
            >
              {aba}
            </button>
          ))}
        </div>

        <div style={styles.rightPanelContent}>{renderAba()}</div>
      </div>
      )}

      <div style={styles.toggleButtons}>
        <button
          style={styles.toggleButton}
          onClick={() => setMostrarPainelEsquerdo(!mostrarPainelEsquerdo)}
        >
          {mostrarPainelEsquerdo ? 'Ocultar controlo' : 'Mostrar controlo'}
        </button>

        <button
          style={styles.toggleButton}
          onClick={() => setMostrarPainelDireito(!mostrarPainelDireito)}
        >
          {mostrarPainelDireito ? 'Ocultar painel' : 'Mostrar painel'}
        </button>
      </div>

      {detalhe && (
        <div style={styles.detailPanel}>
          <div style={styles.panelTitle}>
            Detalhe operacional
          </div>

          <div><strong>Tipo:</strong> {detalhe.tipo}</div>

          {detalhe.tipo === 'recurso' && (
            <>
              {missoes.find(m => m.recurso_id === detalhe.dados.id) && (
                <div>
                  <strong>Missão atual:</strong>{' '}
                  {missoes.find(m => m.recurso_id === detalhe.dados.id)?.titulo}
                </div>
              )}

              {ocorrencias.find(o => o.id === detalhe.dados.ocorrencia_id) && (
                <div
                  style={{ cursor: 'pointer', color: '#2563eb' }}
                  onClick={() =>
                    setDetalhe({
                      tipo: 'ocorrencia',
                      dados: ocorrencias.find(o => o.id === detalhe.dados.ocorrencia_id)
                    })
                  }
                >
                  <strong>Ocorrência associada:</strong>{' '}
                  {ocorrencias.find(o => o.id === detalhe.dados.ocorrencia_id)?.titulo}
                </div>
              )}

              {ordens.find(o => o.recurso_id === detalhe.dados.id && o.estado !== 'concluida') && (
                <div>
                  <strong>Ordem ativa:</strong>{' '}
                  {ordens.find(o => o.recurso_id === detalhe.dados.id && o.estado !== 'concluida')?.titulo}
                </div>
              )}
            </>
          )}

          {detalhe.tipo === 'missao' && (
            <>
              {recursos.find(r => r.id === detalhe.dados.recurso_id) && (
                <div
                  style={{ cursor: 'pointer', color: '#2563eb' }}
                  onClick={() =>
                    setDetalhe({
                      tipo: 'recurso',
                      dados: recursos.find(r => r.id === detalhe.dados.recurso_id)
                    })
                  }
                >
                  <strong>Recurso atribuído:</strong>{' '}
                  {recursos.find(r => r.id === detalhe.dados.recurso_id)?.nome}
                </div>
              )}

              {ocorrencias.find(o => o.id === detalhe.dados.ocorrencia_id) && (
                <div>
                  <strong>Ocorrência associada:</strong>{' '}
                  {ocorrencias.find(o => o.id === detalhe.dados.ocorrencia_id)?.titulo}
                </div>
              )}
            </>
          )}

          {detalhe.tipo === 'ocorrencia' && (
            <>
              {missoes
                .filter(m => m.ocorrencia_id === detalhe.dados.id)
                .map(m => (
                  <div
                    key={m.id}
                    style={{ cursor: 'pointer', color: '#2563eb' }}
                    onClick={() => {
                      setDetalhe(null)

                      setFormMissao({
                        titulo: '',
                        descricao: '',
                        prioridade: 'media',
                        ocorrencia_id: detalhe.dados.id
                      })

                      setMostrarFormMissao(true)
                    }}
                  >
                    <strong>Missão:</strong> {m.titulo}
                  </div>
                ))}

              {recursos
                .filter(r => r.ocorrencia_id === detalhe.dados.id)
                .map(r => (
                  <div
                    key={r.id}
                    style={{ cursor: 'pointer', color: '#2563eb' }}
                    onClick={() => setDetalhe({
                      tipo: 'recurso',
                      dados: r
                    })}
                  >
                    <strong>Recurso no terreno:</strong> {r.nome}
                  </div>
                ))}
            </>
          )}

          {Object.entries(detalhe.dados).map(([key, value]) => {
            const nomes = {
              id: 'ID',
              nome: 'Nome',
              titulo: 'Título',
              tipo: 'Tipo',
              estado: 'Estado',
              ilha: 'Ilha',
              descricao: 'Descrição',
              latitude: 'Latitude',
              longitude: 'Longitude',
              ocorrencia_id: 'Ocorrência associada',
              recurso_id: 'Recurso associado',
              criado_em: 'Criado em',
            }

            if (value === null || value === undefined) return null

            return (
              <div key={key}>
                <strong>{nomes[key] || key}:</strong> {String(value)}
              </div>
            )
          })}

          <div style={styles.detailActions}>

          {detalhe.tipo === 'recurso' && (
            <>
               <button
                style={styles.mainButton}
                onClick={() => mudarEstado(detalhe.dados.id, 'em_missao')}
              >
                Marcar em missão
              </button>

              <button
                style={styles.mainButton}
                onClick={() => mudarEstado(detalhe.dados.id, 'disponivel')}
              >
                Marcar disponível
              </button>

              <button
                style={styles.mainButton}
                onClick={() => {
                  setRecursoParaAtribuirOcorrencia(detalhe.dados)
                }}
              >
                Atribuir ocorrência
              </button>

              <button
                style={styles.mainButton}
                onClick={() => {
                  setFormOrdem({
                    titulo: '',
                    descricao: '',
                    recurso_id: detalhe.dados.id,
                    ocorrencia_id: detalhe.dados.ocorrencia_id || null
                  })

                  setMostrarFormOrdem(true)
                }}
              >
                Criar ordem
              </button>
            </>
          )}

            {detalhe.tipo === 'ocorrencia' && (
              <>
                
                <button
                  style={styles.mainButton}
                  onClick={() => {
                    setDetalhe(null)

                    setFormMissao({
                      titulo: '',
                      descricao: '',
                      prioridade: 'media',
                      ocorrencia_id: detalhe.dados.id
                    })

                    setMostrarFormMissao(true)
                  }}
                >
                  Criar missão
                </button>
              </>
            )}

            {detalhe.tipo === 'missao' && (
              <>
               
                <button
                  style={styles.mainButton}
                  onClick={() => {
                    setMissaoParaAtribuir(detalhe.dados)
                  }}
                >
                  Atribuir recurso
                </button>

                <button
                  style={styles.mainButton}
                  onClick={() => {
                    fetch(`http://127.0.0.1:8000/missoes/${detalhe.dados.id}/concluir`, {
                      method: 'PUT'
                    }).then(() => window.location.reload())
                  }}
                >
                  Concluir missão
                </button>
              </>
            )}

            <button
              style={styles.mainButton}
              onClick={() => {
                if (
                  detalhe.dados.latitude &&
                  detalhe.dados.longitude &&
                  mapRef.current
                ) {
                  mapRef.current.setView(
                    [detalhe.dados.latitude, detalhe.dados.longitude],
                    14
                  )
                }
              }}
            >
              Centrar no mapa
            </button>

            <button
              style={styles.mainButton}
              onClick={() => setDetalhe(null)}
            >
              Fechar
            </button>
            </div>
        </div>
      )}

      {posicaoNovoRecurso && (
        <div style={styles.detailPanel}>
          <div style={styles.panelTitle}>Novo recurso</div>

          <input
            style={styles.input}
            placeholder="Nome"
            value={formRecurso.nome}
            onChange={(e) =>
              setFormRecurso({ ...formRecurso, nome: e.target.value })
            }
          />

          <input
            style={styles.input}
            placeholder="Tipo"
            value={formRecurso.tipo}
            onChange={(e) =>
              setFormRecurso({ ...formRecurso, tipo: e.target.value })
            }
          />

          <button
            style={styles.mainButton}
            onClick={() => {
              if (!formRecurso.nome || !formRecurso.tipo) return

              fetch('http://127.0.0.1:8000/recursos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  nome: formRecurso.nome,
                  tipo: formRecurso.tipo,
                  estado: 'disponivel',
                  ilha: 'Terceira',
                  latitude: posicaoNovoRecurso.latitude,
                  longitude: posicaoNovoRecurso.longitude,
                }),
              }).then(() => window.location.reload())
            }}
          >
            Criar recurso
          </button>

          <button
            style={styles.mainButton}
            onClick={() => {
              setPosicaoNovoRecurso(null)
              setFormRecurso({ nome: '', tipo: '' })
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {posicaoNovaOcorrencia && (
        <div style={styles.detailPanel}>
          <div style={styles.panelTitle}>Nova ocorrência</div>

          <input
            style={styles.input}
            placeholder="Título"
            value={formOcorrencia.titulo}
            onChange={(e) =>
              setFormOcorrencia({ ...formOcorrencia, titulo: e.target.value })
            }
          />

          <input
            style={styles.input}
            placeholder="Tipo"
            value={formOcorrencia.tipo}
            onChange={(e) =>
              setFormOcorrencia({ ...formOcorrencia, tipo: e.target.value })
            }
          />

          <input
            style={styles.input}
            placeholder="Descrição"
            value={formOcorrencia.descricao}
            onChange={(e) =>
              setFormOcorrencia({ ...formOcorrencia, descricao: e.target.value })
            }
          />

          <button
            style={styles.mainButton}
            onClick={() => {
              if (!formOcorrencia.titulo || !formOcorrencia.tipo) return

              fetch('http://127.0.0.1:8000/ocorrencias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  titulo: formOcorrencia.titulo,
                  tipo: formOcorrencia.tipo,
                  descricao: formOcorrencia.descricao,
                  estado: 'aberta',
                  ilha: 'Terceira',
                  latitude: posicaoNovaOcorrencia.latitude,
                  longitude: posicaoNovaOcorrencia.longitude,
                }),
              }).then(() => window.location.reload())
            }}
          >
            Criar ocorrência
          </button>

          <button
            style={styles.mainButton}
            onClick={() => {
              setPosicaoNovaOcorrencia(null)
              setFormOcorrencia({ titulo: '', tipo: '', descricao: '' })
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {mostrarFormMissao && (
        <div style={styles.detailPanel}>
          <div style={styles.panelTitle}>Nova missão</div>

          <input
            style={styles.input}
            placeholder="Título"
            value={formMissao.titulo}
            onChange={(e) =>
              setFormMissao({ ...formMissao, titulo: e.target.value })
            }
          />

          <input
            style={styles.input}
            placeholder="Descrição"
            value={formMissao.descricao}
            onChange={(e) =>
              setFormMissao({ ...formMissao, descricao: e.target.value })
            }
          />

          <select
            style={styles.input}
            value={formMissao.prioridade}
            onChange={(e) =>
              setFormMissao({ ...formMissao, prioridade: e.target.value })
            }
          >
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </select>

          <button
            style={styles.mainButton}
            onClick={() => {
              if (!formMissao.titulo) return

              fetch('http://127.0.0.1:8000/missoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  titulo: formMissao.titulo,
                  descricao: formMissao.descricao,
                  prioridade: formMissao.prioridade,
                  estado: 'planeada',
                  recurso_id: null,
                  ocorrencia_id: formMissao.ocorrencia_id
                })
              }).then(() => window.location.reload())
            }}
          >
            Criar missão
          </button>

          <button
            style={styles.mainButton}
            onClick={() => setMostrarFormMissao(false)}
          >
            Cancelar
          </button>
        </div>
      )}

      {missaoParaAtribuir && (
        <div style={styles.detailPanel}>
          <div style={styles.panelTitle}>
            Atribuir recurso à missão
          </div>

          {recursos
            .filter(r => r.estado === 'disponivel')
            .map(r => (
              <div
                key={r.id}
                style={styles.itemCard}
                onClick={() => {
                  fetch(
                    `http://127.0.0.1:8000/missoes/${missaoParaAtribuir.id}/atribuir-recurso/${r.id}`,
                    { method: 'PUT' }
                  ).then(() => window.location.reload())
                }}
              >
                <strong>{r.nome}</strong>
                <div>{r.tipo}</div>
              </div>
            ))}

          <button
            style={styles.mainButton}
            onClick={() => setMissaoParaAtribuir(null)}
          >
            Cancelar
          </button>
        </div>
      )}

      {mostrarFormOrdem && (
        <div style={styles.detailPanel}>
          <div style={styles.panelTitle}>Nova ordem</div>

          <input
            style={styles.input}
            placeholder="Título"
            value={formOrdem.titulo}
            onChange={(e) =>
              setFormOrdem({ ...formOrdem, titulo: e.target.value })
            }
          />

          <input
            style={styles.input}
            placeholder="Descrição"
            value={formOrdem.descricao}
            onChange={(e) =>
              setFormOrdem({ ...formOrdem, descricao: e.target.value })
            }
          />

          <button
            style={styles.mainButton}
            onClick={() => {
              if (!formOrdem.titulo) return

              fetch('http://127.0.0.1:8000/ordens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  titulo: formOrdem.titulo,
                  descricao: formOrdem.descricao,
                  estado: 'emitida',
                  recurso_id: formOrdem.recurso_id,
                  ocorrencia_id: formOrdem.ocorrencia_id
                })
              }).then(() => window.location.reload())
            }}
          >
            Criar ordem
          </button>

          <button
            style={styles.mainButton}
            onClick={() => setMostrarFormOrdem(false)}
          >
            Cancelar
          </button>
        </div>
      )}

      {recursoParaAtribuirOcorrencia && (
        <div style={styles.detailPanel}>
          <div style={styles.panelTitle}>
            Atribuir ocorrência ao recurso
          </div>

          <div>
            <strong>Recurso:</strong> {recursoParaAtribuirOcorrencia.nome}
          </div>

          <br />

          {ocorrencias
            .filter(o => o.estado !== 'fechada')
            .map(o => (
              <div
                key={o.id}
                style={{ ...styles.itemCard, cursor: 'pointer' }}
                onClick={() => {
                  fetch(
                    `http://127.0.0.1:8000/recursos/${recursoParaAtribuirOcorrencia.id}/atribuir-ocorrencia/${o.id}`,
                    { method: 'PUT' }
                  ).then(() => window.location.reload())
                }}
              >
                <strong>{o.titulo}</strong>
                <div>{o.tipo} · {o.estado}</div>
              </div>
            ))}

          <button
            style={styles.mainButton}
            onClick={() => setRecursoParaAtribuirOcorrencia(null)}
          >
            Cancelar
          </button>
        </div>
      )}

      <div style={styles.mapWrapper}>
        <MapContainer
          center={[38.65, -27.22]}
          zoom={10}
          style={{ height: '100vh', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            attribution="&copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          />

          <GestorCliquesMapa />

          {recursosFiltrados.map((r) => {
            if (!r.latitude || !r.longitude) return null

            const ordensRecurso = ordens.filter((o) => o.recurso_id === r.id)
            const ordem =
              ordensRecurso.length > 0
                ? ordensRecurso.reduce((latest, current) =>
                    new Date(current.criado_em) > new Date(latest.criado_em)
                      ? current
                      : latest
                  )
                : null

            return (
              <Marker
                key={r.id}
                position={[r.latitude, r.longitude]}
                draggable={true}
                icon={L.divIcon({
                  className: '',
                  html: `<div style="
                    font-size: 26px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  ">
                    ${obterIconeRecurso(r.tipo)}
                  </div>`,
                  iconSize: [18, 18],
                  iconAnchor: [9, 9],
                })}
                eventHandlers={{
                  click: () => {
                  setDetalhe({
                    tipo: 'recurso',
                    dados: r
                  })
                },
                  dragend: (e) => {
                    const lat = e.target.getLatLng().lat
                    const lng = e.target.getLatLng().lng

                    fetch(`http://127.0.0.1:8000/recursos/${r.id}/posicao`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        latitude: lat,
                        longitude: lng,
                      }),
                    }).then(() => window.location.reload())
                  },
                }}
              >
                <Popup>
                  <strong>{r.nome}</strong>
                  <br />
                  {r.tipo}
                  <br />
                  Estado: {r.estado}
                  <br /><br />
                  Clique no marcador para abrir o detalhe operacional.
                </Popup>

                <Tooltip permanent direction="top">
                  {r.nome}
                </Tooltip>
              </Marker>
            )
          })}

          {ocorrenciasFiltradas.map((o) =>
            o.latitude && o.longitude ? (
              <>
                <CircleMarker
                  key={`oc-${o.id}`}
                  center={[o.latitude, o.longitude]}
                  radius={10}
                  pathOptions={{ color: 'red' }}
                  eventHandlers={{
                    click: () => {
                      setDetalhe({
                        tipo: 'ocorrencia',
                        dados: o
                      })
                    }
                  }}
                >
                  <Popup>
                    <strong>{o.titulo}</strong>
                    <br />
                    {o.tipo}
                    <br />
                    Estado: {o.estado}
                    <br /><br />
                    Clique na ocorrência para abrir o detalhe operacional.
                  </Popup>
                </CircleMarker>

                {missoes
                  .filter((m) => m.ocorrencia_id === o.id)
                  .map((m) => {
                    let color = 'gray'
                    if (m.estado === 'em_execucao') color = 'red'
                    if (m.estado === 'concluida') color = 'green'

                    return (
                      <CircleMarker
                        key={`missao-${m.id}`}
                        center={[o.latitude, o.longitude]}
                        radius={16}
                        interactive={false}
                        pathOptions={{ color, fillOpacity: 0 }}
                        eventHandlers={{
                          click: (e) => {
                            L.DomEvent.stop(e.originalEvent)

                            setDetalhe({
                              tipo: 'missao',
                              dados: m
                            })
                          }
                        }}
                      />
                    )
                  })}
              </>
            ) : null
          )}

          {bases.map((b) =>
            b.latitude && b.longitude ? (
              <CircleMarker
                key={b.id}
                center={[b.latitude, b.longitude]}
                radius={12}
                pathOptions={{ color: 'blue' }}
              >
                <Popup>
                  <strong>{b.nome}</strong>
                  <br />
                  {b.tipo}
                  <br /><br />
                  Base operacional.
                </Popup>
              </CircleMarker>
            ) : null
          )}

          {recursos.map((r) => {
            if (!r.ocorrencia_id) return null

            const ocorrencia = ocorrencias.find((o) => o.id === r.ocorrencia_id)
            if (!ocorrencia || !r.latitude || !r.longitude) return null

            return (
              <Polyline
                key={`linha-${r.id}`}
                positions={[
                  [r.latitude, r.longitude],
                  [ocorrencia.latitude, ocorrencia.longitude],
                ]}
              />
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}

const styles = {
  appShell: {
    position: 'relative',
    width: '100%',
    height: '100vh',
    background: '#0f172a',
    overflow: 'hidden',
    fontFamily: 'Arial, sans-serif',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '56px',
    zIndex: 1200,
    background: 'rgba(15, 23, 42, 0.92)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    boxSizing: 'border-box',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  topBarTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },
  kpiRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  kpiBox: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    padding: '6px 10px',
    minWidth: '92px',
  },
  kpiLabel: {
    fontSize: '11px',
    opacity: 0.8,
  },
  kpiValue: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  leftPanel: {
    position: 'absolute',
    top: '68px',
    left: '10px',
    bottom: '10px',
    width: '220px',
    zIndex: 1100,
    background: 'rgba(255,255,255,0.88)',
    borderRadius: '12px',
    padding: '12px',
    boxSizing: 'border-box',
    overflowY: 'auto',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  },
  rightPanel: {
    position: 'absolute',
    top: '68px',
    right: '10px',
    bottom: '10px',
    width: '260px',
    zIndex: 1100,
    background: 'rgba(255,255,255,0.88)',
    borderRadius: '12px',
    boxSizing: 'border-box',
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  },
  rightPanelContent: {
    padding: '12px',
    overflowY: 'auto',
    height: 'calc(100% - 48px)',
    boxSizing: 'border-box',
  },
  tabBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    padding: '10px',
    borderBottom: '1px solid #e5e7eb',
    background: '#f8fafc',
  },
  tabButton: {
    border: '1px solid #cbd5e1',
    background: 'white',
    borderRadius: '8px',
    padding: '6px 10px',
    cursor: 'pointer',
    textTransform: 'capitalize',
  },
  tabButtonActive: {
    background: '#0f172a',
    color: 'white',
    border: '1px solid #0f172a',
  },
  panelTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '10px',
  },
  sectionTitle: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  checkboxLabel: {
    display: 'block',
    marginBottom: '12px',
  },
  helpBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '10px',
    fontSize: '13px',
    marginBottom: '12px',
  },
  reportBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '10px',
    marginBottom: '12px',
  },
  reportText: {
    fontSize: '13px',
    lineHeight: 1.5,
    marginBottom: '10px',
  },
  legendBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '10px',
    fontSize: '13px',
    lineHeight: 1.6,
  },
  mainButton: {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: 'none',
    background: '#0f172a',
    color: 'white',
    cursor: 'pointer',
  },
  itemCard: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '8px',
    marginBottom: '8px',
  },
  itemTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
  },
  itemMeta: {
    fontSize: '12px',
    color: '#475569',
    marginTop: '2px',
  },
  itemSubtle: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '4px',
  },
  buttonRow: {
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
  },
  smallButton: {
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    background: 'white',
    cursor: 'pointer',
  },
  mapWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
    toggleButtons: {
    position: 'absolute',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1300,
    display: 'flex',
    gap: '8px',
  },

  toggleButton: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    background: 'rgba(255,255,255,0.92)',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  detailPanel: {
    position: 'absolute',
    bottom: '70px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1300,
    width: '360px',
    maxHeight: '45vh',
    overflowY: 'auto',
    background: 'rgba(255,255,255,0.96)',
    borderRadius: '12px',
    padding: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    fontSize: '13px',
  },
  detailActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '12px',
  },
  input: {
    width: '100%',
    padding: '8px',
    marginBottom: '8px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
  },
}

export default App