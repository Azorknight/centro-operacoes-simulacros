import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  CircleMarker,
  Tooltip,
  Polyline,
} from 'react-leaflet'
import L from 'leaflet'
import jsPDF from 'jspdf'
import FichaOperacional from './components/FichaOperacional'
import PainelTimeline from './components/PainelTimeline'
import RelogioOperacional from './components/RelogioOperacional'
import CronometroOcorrencia from './components/CronometroOcorrencia'
import GestorCliquesMapa from './components/GestorCliquesMapa'
import { obterIconeRecurso, obterCorOcorrencia, obterCorSituacaoMissao, formatarDuracao, formatarDataHora } from './utils/formatacao'
import Operacoes from './pages/Operacoes'
import { desativarOperacao, encerrarOperacao, obterOperacaoAtiva, reabrirOperacao, obterDiagnostico, obterBackups, criarBackup, restaurarBackup, eliminarBackup } from './services/api'
import {
  obterRecursos,
  obterOcorrencias,
  obterBases,
  obterTimeline,
  obterOrdens,
  obterMissoes,
  obterRelatorio,
  obterElementos,
  confirmarChegada,
  criarRecurso,
  criarElemento,
  criarOcorrencia,
  criarMissao,
  criarOrdem,
  atribuirOcorrencia,
  atribuirRecursoMissao,
  removerRecursoMissao,
  alterarEstadoMissao,
  alterarSituacaoMissao,
  obterNotasMissao,
  adicionarNotaMissao,
  obterEstatisticasMissao,
  obterTimelineMissao,
  obterHistoricoRecurso,
  libertarRecurso,
  alterarEstadoOcorrencia,
  obterTimelineOcorrencia,
  obterEstatisticasOcorrencia,
  alterarEstadoRecurso,
  alterarEstadoOrdem,
  atualizarPosicaoRecurso,
  atualizarPosicaoElemento,
  reembarcarElemento,
  concluirMissao,
  obterObjetivos,
  criarObjetivo,
  atualizarObjetivo,
  eliminarObjetivo,
  associarObjetivoMissao,
  obterModelosObjetivo,
  criarModeloObjetivo,
  atualizarModeloObjetivo,
  eliminarModeloObjetivo,
  obterSetores,
  criarSetor,
  atualizarSetor,
  eliminarSetor,
  associarSetorObjetivo,
  associarSetorMissao
} from './services/api' 

function obterPosicaoIconeMissao(latitude, longitude, indice, total) {
  const quantidade = Math.max(total, 1)
  const angulo = (-Math.PI / 2) + ((2 * Math.PI * indice) / quantidade)
  const distancia = quantidade === 1 ? 0.00032 : 0.00042

  return [
    latitude + Math.sin(angulo) * distancia,
    longitude + Math.cos(angulo) * distancia
  ]
}

function criarIconeMissao(cor, selecionada = false) {
  const tamanho = selecionada ? 32 : 28

  return L.divIcon({
    className: 'icone-missao-leaflet',
    html: `<div style="
      width:${tamanho}px;
      height:${tamanho}px;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#ffffff;
      border:${selecionada ? 4 : 3}px solid ${cor};
      box-shadow:0 2px 8px rgba(15, 23, 42, 0.35);
      font-size:${selecionada ? 17 : 15}px;
      line-height:1;
      cursor:pointer;
    ">🎯</div>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho / 2]
  })
}
function CentroOperacoes({ modoConsulta = false, operacaoAtiva = null, modoReplay = false, replayEventoAtual = null }) {
  const [recursos, setRecursos] = useState([])
  const [ocorrencias, setOcorrencias] = useState([])
  const [bases, setBases] = useState([])
  const [timeline, setTimeline] = useState([])
  const [ordens, setOrdens] = useState([])
  const [missoes, setMissoes] = useState([])
  const [objetivos, setObjetivos] = useState([])
  const [modelosObjetivo, setModelosObjetivo] = useState([])
  const [mostrarArquivadosObjetivos, setMostrarArquivadosObjetivos] = useState(false)
  const [setores, setSetores] = useState([])
  const [mostrarArquivadosSetores, setMostrarArquivadosSetores] = useState(false)
  const [relatorio, setRelatorio] = useState(null)
  const [mostrarSoAtivos, setMostrarSoAtivos] = useState(false)
  const [mostrarLigacoesMissoes, setMostrarLigacoesMissoes] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState('recursos')
  const [mostrarPainelEsquerdo, setMostrarPainelEsquerdo] = useState(true)
  const [mostrarPainelDireito, setMostrarPainelDireito] = useState(true)
  const [detalhe, setDetalhe] = useState(null)
  const [formRecurso, setFormRecurso] = useState({
    nome: '',
    tipo: '',
    indicativo_radio: ''
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
    responsavel: '',
    notas: '',
    situacao_operacional: 'estavel',
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
  const [elementos, setElementos] = useState([])
  const [formElemento, setFormElemento] = useState({
    nome: '',
    funcao: '',
    entidade: '',
    indicativo_radio: '',
    recurso_id: null
  })

  const [mostrarFormElemento, setMostrarFormElemento] = useState(false)
  const [modoMapa, setModoMapa] = useState({ tipo: 'normal', alvo: null })
  const elementoParaApear = modoMapa.tipo === 'apear_elemento' ? modoMapa.alvo : null
  const [elementoParaReembarcar, setElementoParaReembarcar] = useState(null)
  const [historicoRecurso, setHistoricoRecurso] = useState(null)
  const [estatisticasOcorrencia, setEstatisticasOcorrencia] = useState(null)
  const [timelineOcorrencia, setTimelineOcorrencia] = useState([])
  const [estatisticasMissao, setEstatisticasMissao] = useState(null)
  const [timelineMissao, setTimelineMissao] = useState([])
  const [notasMissao, setNotasMissao] = useState([])
  const [novaNotaMissao, setNovaNotaMissao] = useState({ autor: 'Operador', texto: '' })
  const [pesquisaGlobal, setPesquisaGlobal] = useState('')
  const [mostrarAlertas, setMostrarAlertas] = useState(true)
  const modoBloqueado = modoConsulta || modoReplay

  useEffect(() => {
    if (modoMapa.tipo === 'normal') return undefined

    const cancelarModo = (event) => {
      if (event.key === 'Escape') {
        setModoMapa({ tipo: 'normal', alvo: null })
      }
    }

    window.addEventListener('keydown', cancelarModo)
    return () => window.removeEventListener('keydown', cancelarModo)
  }, [modoMapa.tipo])


  useEffect(() => {
    if (detalhe?.tipo !== 'ocorrencia') {
      setEstatisticasOcorrencia(null)
      setTimelineOcorrencia([])
      return
    }
    Promise.all([
      obterEstatisticasOcorrencia(detalhe.dados.id),
      obterTimelineOcorrencia(detalhe.dados.id)
    ]).then(([estatisticas, eventos]) => {
      setEstatisticasOcorrencia(estatisticas)
      setTimelineOcorrencia(eventos)
    }).catch(console.error)
  }, [detalhe?.tipo, detalhe?.dados?.id])

  useEffect(() => {
    if (detalhe?.tipo !== 'missao') {
      setEstatisticasMissao(null)
      setTimelineMissao([])
      setNotasMissao([])
      return
    }
    Promise.all([
      obterEstatisticasMissao(detalhe.dados.id),
      obterTimelineMissao(detalhe.dados.id),
      obterNotasMissao(detalhe.dados.id)
    ]).then(([estatisticas, eventos, notas]) => {
      setEstatisticasMissao(estatisticas)
      setTimelineMissao(eventos)
      setNotasMissao(notas)
    }).catch(console.error)
  }, [detalhe?.tipo, detalhe?.dados?.id])

  const mapRef = useRef()
  const arrastoMapaRef = useRef(false)

  async function atualizarDados() {
    try {
      const [
        recursosData,
        ocorrenciasData,
        basesData,
        timelineData,
        ordensData,
        missoesData,
        objetivosData,
        modelosObjetivoData,
        setoresData,
        relatorioData,
        elementosData
      ] = await Promise.all([
        obterRecursos(),
        obterOcorrencias(),
        obterBases(),
        obterTimeline(),
        obterOrdens(),
        obterMissoes(),
        obterObjetivos(mostrarArquivadosObjetivos),
        obterModelosObjetivo(),
        obterSetores(mostrarArquivadosSetores),
        obterRelatorio(),
        obterElementos()
      ])

      // Evita que a atualização automática reponha a posição anterior durante o arrasto.
      if (arrastoMapaRef.current) return

      setRecursos(recursosData)
      setOcorrencias(ocorrenciasData)
      setBases(basesData)
      setTimeline(timelineData)
      setOrdens(ordensData)
      setMissoes(missoesData)
      setObjetivos(objetivosData)
      setModelosObjetivo(modelosObjetivoData)
      setSetores(setoresData)
      setRelatorio(relatorioData)
      setElementos(elementosData)
    } catch (erro) {
      console.error('Erro ao atualizar dados:', erro)
    }
  }

  async function refresh() {
    await atualizarDados()

    if (detalhe?.tipo === 'recurso') {
      const hist = await obterHistoricoRecurso(detalhe.dados.id)
      setHistoricoRecurso(hist)
    }
    if (detalhe?.tipo === 'ocorrencia') {
      const [estatisticas, eventos] = await Promise.all([
        obterEstatisticasOcorrencia(detalhe.dados.id),
        obterTimelineOcorrencia(detalhe.dados.id)
      ])
      setEstatisticasOcorrencia(estatisticas)
      setTimelineOcorrencia(eventos)
    }
  }

  useEffect(() => {
    atualizarDados()
    const atualizacaoAutomatica = setInterval(() => atualizarDados(), 5000)

    const abrirFormRecurso = (event) => {
      setPosicaoNovoRecurso(event.detail)
    }

    window.addEventListener('abrir-form-recurso', abrirFormRecurso)

    const abrirFormOcorrencia = (event) => {
      setPosicaoNovaOcorrencia(event.detail)
    }

    window.addEventListener('abrir-form-ocorrencia', abrirFormOcorrencia)

    return () => {
      clearInterval(atualizacaoAutomatica)
      window.removeEventListener('abrir-form-recurso', abrirFormRecurso)
      window.removeEventListener('abrir-form-ocorrencia', abrirFormOcorrencia)
    }
  }, [])
    
  async function mudarEstado(id, novoEstado) {
    await alterarEstadoRecurso(id, novoEstado)
    await refresh()
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

  const termoPesquisa = pesquisaGlobal.trim().toLowerCase()
  const resultadosPesquisa = useMemo(() => {
    if (!termoPesquisa) return []
    const resultados = []
    recursos.forEach(r => {
      const texto = `${r.nome || ''} ${r.indicativo_radio || ''} ${r.tipo || ''} ${r.estado || ''}`.toLowerCase()
      if (texto.includes(termoPesquisa)) resultados.push({ tipo: 'recurso', dados: r, titulo: r.indicativo_radio || r.nome, subtitulo: `${r.tipo} · ${r.estado}` })
    })
    ocorrencias.forEach(o => {
      const texto = `${o.titulo || ''} ${o.tipo || ''} ${o.estado || ''} ${o.descricao || ''}`.toLowerCase()
      if (texto.includes(termoPesquisa)) resultados.push({ tipo: 'ocorrencia', dados: o, titulo: o.titulo, subtitulo: `${o.tipo} · ${o.estado}` })
    })
    elementos.forEach(e => {
      const texto = `${e.nome || ''} ${e.indicativo_radio || ''} ${e.funcao || ''} ${e.entidade || ''}`.toLowerCase()
      if (texto.includes(termoPesquisa)) resultados.push({ tipo: 'elemento', dados: e, titulo: e.indicativo_radio || e.nome, subtitulo: `${e.funcao || 'Elemento'} · ${e.entidade || ''}` })
    })
    return resultados.slice(0, 12)
  }, [termoPesquisa, recursos, ocorrencias, elementos])

  function selecionarResultado(resultado) {
    setDetalhe({ tipo: resultado.tipo, dados: resultado.dados })
    const d = resultado.dados
    if (d.latitude && d.longitude && mapRef.current) mapRef.current.setView([d.latitude, d.longitude], 14)
    setPesquisaGlobal('')
  }

  const alertasRecentes = useMemo(() => timeline.slice(0, 5), [timeline])

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

    doc.text('Elementos:', 25, 70)
    doc.text(String(relatorio.elementos ?? elementos.length), 100, 70)

    doc.text('Ocorrências:', 25, 80)
    doc.text(String(relatorio.ocorrencias), 100, 80)

    doc.text('Ordens:', 25, 90)
    doc.text(String(relatorio.ordens), 100, 90)

    doc.setFontSize(14)
    doc.text('Missões', 20, 110)

    doc.setFontSize(12)
    doc.text('Total:', 25, 120)
    doc.text(String(relatorio.missoes_total), 100, 120)

    doc.text('Ativas:', 25, 130)
    doc.text(String(relatorio.missoes_ativas), 100, 130)

    doc.text('Concluídas:', 25, 140)
    doc.text(String(relatorio.missoes_concluidas), 100, 140)

    doc.setFontSize(10)
    doc.text('Centro de Operações e Simulacros', 20, 155)

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

  async function pedirDadosObjetivo(objetivo = null) {
    const modeloEscolhido = !objetivo && modelosObjetivo.length > 0
      ? window.prompt(`Modelo (opcional):\n${modelosObjetivo.map(m => `${m.id} - ${m.nome}`).join('\n')}`, '')
      : null
    const modelo = modelosObjetivo.find(m => String(m.id) === String(modeloEscolhido))
    const nome = window.prompt('Nome do objetivo:', objetivo?.nome || modelo?.nome || '')
    if (nome === null || !nome.trim()) return null
    const descricao = window.prompt('Descrição:', objetivo?.descricao || modelo?.descricao || '') ?? ''
    const prioridade = window.prompt('Prioridade: critica, alta, normal ou baixa', objetivo?.prioridade || modelo?.prioridade || 'normal') || 'normal'
    const estado = window.prompt('Estado: planeado, em_preparacao, em_execucao, suspenso, concluido ou cancelado', objetivo?.estado || 'planeado') || 'planeado'
    const responsavel = window.prompt('Responsável (opcional):', objetivo?.responsavel || '') || null
    const ocorrenciaTexto = window.prompt(`Ocorrência associada (ID, opcional):\n${ocorrencias.map(o => `${o.id} - ${o.titulo}`).join('\n')}`, objetivo?.ocorrencia_id || '')
    return {
      nome: nome.trim(), descricao, prioridade, estado, responsavel,
      ocorrencia_id: ocorrenciaTexto ? Number(ocorrenciaTexto) : null,
      modelo_id: objetivo?.modelo_id || modelo?.id || null,
      latitude: objetivo?.latitude || null, longitude: objetivo?.longitude || null,
      notas: objetivo?.notas || null, arquivado: objetivo?.arquivado || false
    }
  }

  async function novoObjetivo() {
    const dados = await pedirDadosObjetivo()
    if (!dados) return
    await criarObjetivo(dados)
    await atualizarDados()
  }

  async function editarObjetivo(objetivo) {
    const dados = await pedirDadosObjetivo(objetivo)
    if (!dados) return
    await atualizarObjetivo(objetivo.id, dados)
    await atualizarDados()
  }

  async function gerirModelosObjetivo() {
    const escolha = window.prompt(`MODELOS DE OBJETIVO\n${modelosObjetivo.map(m => `${m.id} - ${m.nome}`).join('\n')}\n\nEscreva N para novo, E para editar ou A para apagar:`,'N')
    if (!escolha) return
    const acao = escolha.trim().toUpperCase()
    if (acao === 'N') {
      const nome = window.prompt('Nome do modelo:')
      if (!nome) return
      const descricao = window.prompt('Descrição:', '') || ''
      const prioridade = window.prompt('Prioridade padrão:', 'normal') || 'normal'
      await criarModeloObjetivo({ nome, descricao, prioridade, ativo: true })
    } else if (acao === 'E') {
      const id = Number(window.prompt('ID do modelo a editar:'))
      const modelo = modelosObjetivo.find(m => m.id === id)
      if (!modelo) return window.alert('Modelo não encontrado.')
      const nome = window.prompt('Nome:', modelo.nome)
      if (!nome) return
      const descricao = window.prompt('Descrição:', modelo.descricao || '') || ''
      const prioridade = window.prompt('Prioridade padrão:', modelo.prioridade || 'normal') || 'normal'
      await atualizarModeloObjetivo(id, { nome, descricao, prioridade, ativo: true })
    } else if (acao === 'A') {
      const id = Number(window.prompt('ID do modelo a apagar:'))
      if (id && window.confirm('Apagar este modelo?')) await eliminarModeloObjetivo(id)
    }
    await atualizarDados()
  }

  async function pedirDadosSetor(setor = null) {
    const nome = window.prompt('Nome do setor:', setor?.nome || '')
    if (nome === null || !nome.trim()) return null
    const descricao = window.prompt('Descrição:', setor?.descricao || '') ?? ''
    const comandante = window.prompt('Comandante do setor (opcional):', setor?.comandante || '') || null
    const estado = window.prompt('Estado: planeado, ativo, suspenso ou encerrado', setor?.estado || 'ativo') || 'ativo'
    const cor = window.prompt('Cor do setor (hexadecimal):', setor?.cor || '#2563eb') || '#2563eb'
    const notas = window.prompt('Notas operacionais (opcional):', setor?.notas || '') || null
    return {
      nome: nome.trim(),
      descricao,
      comandante,
      estado,
      cor,
      notas,
      arquivado: setor?.arquivado || false
    }
  }

  async function novoSetor() {
    const dados = await pedirDadosSetor()
    if (!dados) return
    await criarSetor(dados)
    await atualizarDados()
  }

  async function editarSetor(setor) {
    const dados = await pedirDadosSetor(setor)
    if (!dados) return
    await atualizarSetor(setor.id, dados)
    await atualizarDados()
  }

  async function escolherSetorObjetivo(objetivo) {
    const atual = objetivo.setor_id || ''
    const escolha = window.prompt(
      `Setor do objetivo (ID; vazio para retirar):\n${setores.filter(s => !s.arquivado).map(s => `${s.id} - ${s.nome}`).join('\n')}`,
      atual
    )
    if (escolha === null) return
    await associarSetorObjetivo(objetivo.id, escolha ? Number(escolha) : null)
    await atualizarDados()
  }

  async function escolherSetorMissao(missao) {
    const atual = missao.setor_id || ''
    const escolha = window.prompt(
      `Setor da missão (ID; vazio para retirar):\n${setores.filter(s => !s.arquivado).map(s => `${s.id} - ${s.nome}`).join('\n')}`,
      atual
    )
    if (escolha === null) return
    await associarSetorMissao(missao.id, escolha ? Number(escolha) : null)
    await atualizarDados()
  }

  function renderAba() {
    if (abaAtiva === 'recursos') {
      return (
        <>
          <strong style={styles.sectionTitle}>Recursos</strong>
          {recursosFiltrados.map((r) => (
            <div key={r.id} style={{ ...styles.itemCard, cursor: 'pointer' }} onClick={() => {
              setDetalhe({ tipo: 'recurso', dados: r })
              if (r.latitude && r.longitude && mapRef.current) mapRef.current.setView([r.latitude, r.longitude], 14)
            }}>
              <div style={styles.itemTitle}>{obterIconeRecurso(r.tipo)} {r.indicativo_radio || r.nome}</div>
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
                    alterarEstadoOrdem(o.id, 'executada')
                      .then(() => atualizarDados())
                  }}
                >
                  Executar
                </button>
                <button
                  style={styles.smallButton}
                  onClick={() => {
                    alterarEstadoOrdem(o.id, 'concluida')
                      .then(() => atualizarDados())
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
          {missoesFiltradas
            .filter((m) => m.estado !== 'concluida')
            .map((m) => {
              const recursosMissao = recursos.filter((r) => (m.recurso_ids || []).includes(r.id))

              return (
              <div
                key={m.id}
                style={{ ...styles.itemCard, cursor: 'pointer' }}
                onClick={() => {
                  setDetalhe({ tipo: 'missao', dados: m })

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
                {m.responsavel && <div style={styles.itemSubtle}>Responsável: {m.responsavel}</div>}
                <div style={styles.itemSubtle}>
                  {recursosMissao.length === 0
                    ? 'Sem recursos atribuídos'
                    : `${recursosMissao.length} recurso${recursosMissao.length === 1 ? '' : 's'} atribuído${recursosMissao.length === 1 ? '' : 's'}`}
                </div>

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
                    disabled={modoBloqueado}
                    onClick={(e) => {
                      e.stopPropagation()
                      escolherSetorMissao(m)
                    }}
                  >
                    Setor
                  </button>

                  <button
                    style={styles.smallButton}
                    onClick={async (e) => {
                      e.stopPropagation()

                      await concluirMissao(m.id)
                      await refresh()
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

    if (abaAtiva === 'setores') {
      return (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <button style={styles.smallButton} disabled={modoBloqueado} onClick={novoSetor}>➕ Novo setor</button>
            <button style={styles.smallButton} onClick={async () => {
              const v = !mostrarArquivadosSetores
              setMostrarArquivadosSetores(v)
              setSetores(await obterSetores(v))
            }}>
              {mostrarArquivadosSetores ? 'Ocultar arquivados' : '🗂 Arquivados'}
            </button>
          </div>
          <strong style={styles.sectionTitle}>Setores operacionais</strong>
          {setores.length === 0 && <div style={styles.itemSubtle}>Ainda não existem setores.</div>}
          {setores.map(s => (
            <div key={s.id} style={{ ...styles.itemCard, borderLeft: `5px solid ${s.cor || '#2563eb'}`, opacity: s.arquivado ? .6 : 1 }}>
              <div style={styles.itemTitle}>▰ {s.nome}</div>
              <div style={styles.itemMeta}>{s.estado} · {s.total_objetivos || 0} objetivo(s) · {s.total_missoes || 0} missão(ões)</div>
              {s.comandante && <div style={styles.itemSubtle}>Comandante: {s.comandante}</div>}
              {s.descricao && <div style={styles.itemSubtle}>{s.descricao}</div>}
              <div style={styles.buttonRow}>
                <button style={styles.smallButton} disabled={modoBloqueado || s.arquivado} onClick={() => editarSetor(s)}>Editar</button>
                <button
                  style={styles.smallButton}
                  disabled={modoBloqueado || s.arquivado}
                  onClick={async () => {
                    if (!window.confirm('Eliminar este setor? Se já estiver em utilização, será arquivado.')) return
                    await eliminarSetor(s.id)
                    await atualizarDados()
                  }}
                >
                  {(s.total_objetivos || s.total_missoes) ? 'Arquivar' : 'Eliminar'}
                </button>
              </div>
            </div>
          ))}
        </>
      )
    }

    if (abaAtiva === 'objetivos') {
      const cores = { critica: '#dc2626', alta: '#ea580c', normal: '#2563eb', baixa: '#16a34a' }
      return (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <button style={styles.smallButton} disabled={modoBloqueado} onClick={novoObjetivo}>➕ Novo objetivo</button>
            <button style={styles.smallButton} disabled={modoBloqueado} onClick={gerirModelosObjetivo}>📋 Modelos</button>
            <button style={styles.smallButton} onClick={async () => { const v=!mostrarArquivadosObjetivos; setMostrarArquivadosObjetivos(v); setObjetivos(await obterObjetivos(v)) }}>
              {mostrarArquivadosObjetivos ? 'Ocultar arquivados' : '🗂 Arquivados'}
            </button>
          </div>
          <strong style={styles.sectionTitle}>Objetivos operacionais</strong>
          {objetivos.length === 0 && <div style={styles.itemSubtle}>Ainda não existem objetivos.</div>}
          {objetivos.map(o => (
            <div key={o.id} style={{ ...styles.itemCard, borderLeft: `5px solid ${cores[o.prioridade] || '#64748b'}`, opacity: o.arquivado ? .6 : 1 }}>
              <div style={styles.itemTitle}>🎯 {o.nome}</div>
              <div style={styles.itemMeta}>{o.prioridade} · {o.estado} · {o.total_missoes || 0} missão(ões)</div>
              {o.responsavel && <div style={styles.itemSubtle}>Responsável: {o.responsavel}</div>}
              <div style={styles.itemSubtle}>Setor: {setores.find(s => s.id === o.setor_id)?.nome || 'Sem setor'}</div>
              {o.descricao && <div style={styles.itemSubtle}>{o.descricao}</div>}
              <div style={styles.buttonRow}>
                <button style={styles.smallButton} disabled={modoBloqueado || o.arquivado} onClick={() => editarObjetivo(o)}>Editar</button>
                <button style={styles.smallButton} disabled={modoBloqueado || o.arquivado} onClick={() => escolherSetorObjetivo(o)}>Setor</button>
                <button style={styles.smallButton} disabled={modoBloqueado || o.arquivado} onClick={async () => { if(window.confirm('Eliminar este objetivo? Se já tiver missões, será arquivado.')) { await eliminarObjetivo(o.id); await atualizarDados() } }}>
                  {o.total_missoes ? 'Arquivar' : 'Eliminar'}
                </button>
              </div>
            </div>
          ))}
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
              <div style={{ ...styles.itemMeta, color }}>
                {t.tipo} · {new Date(t.criado_em).toLocaleString('pt-PT', {
                  timeZone: 'Atlantic/Azores',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>

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
            <div style={styles.kpiLabel}>Elementos</div>
            <div style={styles.kpiValue}>{elementos.length}</div>
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

      <div style={styles.commandStrip}>
        <div><span style={styles.commandLabel}>OPERAÇÃO</span><strong>{operacaoAtiva?.nome || 'Operação ativa'}</strong></div>
        <div><span style={styles.commandLabel}>HORA AÇORES</span><strong><RelogioOperacional /></strong></div>
        <div><span style={styles.commandLabel}>ESTADO</span><strong>{modoReplay ? 'REPLAY' : (modoConsulta ? 'ENCERRADA' : 'ATIVA')}</strong></div>
        <div style={styles.globalSearchWrap}>
          <input
            value={pesquisaGlobal}
            onChange={(e) => setPesquisaGlobal(e.target.value)}
            placeholder="Pesquisar recurso, ocorrência ou elemento..."
            style={styles.globalSearch}
          />
          {resultadosPesquisa.length > 0 && (
            <div style={styles.searchResults}>
              {resultadosPesquisa.map((resultado, index) => (
                <button key={`${resultado.tipo}-${resultado.dados.id}-${index}`} style={styles.searchResult} onClick={() => selecionarResultado(resultado)}>
                  <strong>{resultado.titulo}</strong><span>{resultado.subtitulo}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {mostrarAlertas && alertasRecentes.length > 0 && (
        <div style={styles.alertPanel}>
          <div style={styles.alertHeader}><strong>Alertas operacionais</strong><button style={styles.alertClose} onClick={() => setMostrarAlertas(false)}>×</button></div>
          {alertasRecentes.map(a => (
            <div key={a.id} style={styles.alertItem}>
              <span>{a.tipo === 'ocorrencia' ? '🔴' : a.tipo === 'movimento' ? '🟢' : a.tipo === 'ordem' ? '🟠' : '🔵'}</span>
              <div><strong>{a.descricao}</strong><small>{new Date(a.criado_em).toLocaleTimeString('pt-PT', { timeZone: 'Atlantic/Azores', hour: '2-digit', minute: '2-digit' })}</small></div>
            </div>
          ))}
        </div>
      )}

      {!mostrarAlertas && <button style={styles.showAlertsButton} onClick={() => setMostrarAlertas(true)}>🔔 Alertas</button>}

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

        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={mostrarLigacoesMissoes}
            onChange={(e) => setMostrarLigacoesMissoes(e.target.checked)}
          />
          Mostrar ligações das missões
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
              <div>Elementos: {relatorio.elementos ?? elementos.length}</div>
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

          <div>🚑 Ambulância</div>
          <div>🚒 Bombeiros</div>
          <div>🚓 Polícia</div>
          <div>🏍️ Moto</div>
          <div>🚁 Drone / Aéreo</div>

          <br />

          <div>🟡 Ordem emitida</div>
          <div>🟠 Ordem executada</div>

          <br />

          <div>🔴 Incêndio</div>
          <div>🟠 Acidente</div>
          <div>🟣 Evacuação</div>
          <div>🟢 Ocorrência fechada</div>

          <br />

          <div>🟢 Missão sob controlo</div>
          <div>🟡 Missão estável</div>
          <div>🟠 Missão complexa</div>
          <div>🔴 Missão crítica</div>
          <div>⚫ Missão necessita de reforço</div>
          <div>✅ Missão concluída</div>

          <br />

          <div>🔵 Base operacional</div>
        </div>
      </div>
      )}

      {mostrarPainelDireito && (
        <div style={styles.rightPanel}>
        <div style={styles.tabBar}>
          {['recursos', 'ocorrencias', 'setores', 'objetivos', 'missoes', 'ordens', 'timeline'].map((aba) => (
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
            {detalhe.tipo === 'recurso' ? 'Painel de Comando' : 'Ficha operacional'}
          </div>

          {detalhe.tipo !== 'recurso' && (
            <div style={styles.itemCard}>
              <strong>
                {detalhe.tipo === 'ocorrencia' && '📍 Ocorrência'}
                {detalhe.tipo === 'missao' && '🎯 Missão'}
                {detalhe.tipo === 'elemento' && '👤 Elemento'}
                {detalhe.tipo === 'base' && '🏢 Base'}
              </strong>
            </div>
          )}

          {detalhe.tipo === 'recurso' && (() => {
            const recursoAtual = recursos.find(r => r.id === detalhe.dados.id) || detalhe.dados
            const elementosEmbarcados = elementos.filter(el => el.recurso_id === recursoAtual.id)
            const missaoAtual = missoes.find(m => m.recurso_id === recursoAtual.id && m.estado !== 'concluida')
            const ordemAtual = ordens.find(o => o.recurso_id === recursoAtual.id && o.estado !== 'concluida')
            const ocorrenciaAtual = ocorrencias.find(o => o.id === recursoAtual.ocorrencia_id)
            return (
              <div style={{ ...styles.itemCard, border: '2px solid #2563eb' }}>
                <h3 style={{ margin: 0 }}>{obterIconeRecurso(recursoAtual.tipo)} {recursoAtual.indicativo_radio || recursoAtual.nome}</h3>
                <div style={{ color: '#64748b', marginBottom: 10 }}>{recursoAtual.nome} · {recursoAtual.tipo}</div>
                <div><strong>Estado:</strong> {recursoAtual.estado}</div>
                <div><strong>Função:</strong> {recursoAtual.funcao_operacional || '-'}</div>
                <div><strong>Ilha:</strong> {recursoAtual.ilha || '-'}</div>
                <div><strong>Ocorrência:</strong> {ocorrenciaAtual?.titulo || 'Nenhuma'}</div>
                <div><strong>Missão:</strong> {missaoAtual?.titulo || 'Nenhuma'}</div>
                <div><strong>Ordem ativa:</strong> {ordemAtual?.titulo || 'Nenhuma'}</div>
                <div style={{ marginTop: 8 }}><strong>Elementos embarcados:</strong> {elementosEmbarcados.length}</div>
              </div>
            )
          })()}
          
          {detalhe.tipo === 'recurso' && (
            <>
              {elementos
                .filter(el => el.recurso_id === detalhe.dados.id)
                .map(el => (
                  <div key={el.id} style={styles.itemCard}>
                    <strong>{el.nome}</strong>
                    <div>{el.funcao}</div>
                    <div>Indicativo: {el.indicativo_radio || 'sem indicativo'}</div>
                    <button
                      style={styles.smallButton}
                      onClick={() => {
                        setModoMapa({ tipo: 'apear_elemento', alvo: el })
                        setDetalhe(null)
                      }}
                    >
                      Deixar apeado
                    </button>
                  </div>
                ))}

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

          {detalhe.tipo === 'missao' && (() => {
            const missaoAtual = missoes.find(m => m.id === detalhe.dados.id) || detalhe.dados
            const estadosMissao = [
              ['recebida', 'Recebida'],
              ['planeada', 'Planeada'],
              ['em_execucao', 'Em execução'],
              ['concluida', 'Concluída'],
              ['cancelada', 'Cancelada']
            ]
            const ocorrenciaMissao = ocorrencias.find(o => o.id === missaoAtual.ocorrencia_id)
            const recursosMissao = recursos.filter(r => (missaoAtual.recurso_ids || []).includes(r.id))
            return (
              <>
                <div style={{ ...styles.itemCard, border: '2px solid #7c3aed' }}>
                  <h3 style={{ margin: 0 }}>🎯 {missaoAtual.titulo}</h3>
                  <div style={{ color: '#64748b', marginBottom: 8 }}>
                    Prioridade: {missaoAtual.prioridade || 'media'}
                  </div>
                  <div><strong>Estado:</strong> {estadosMissao.find(([id]) => id === missaoAtual.estado)?.[1] || missaoAtual.estado}</div>
                  <div><strong>Situação:</strong> {{
                    sob_controlo: '🟢 Sob controlo', estavel: '🟡 Estável', complexa: '🟠 Complexa',
                    critica: '🔴 Crítica', necessita_reforco: '⚫ Necessita de reforço'
                  }[missaoAtual.situacao_operacional] || '🟡 Estável'}</div>
                  <div><strong>Responsável:</strong> {missaoAtual.responsavel || 'Não definido'}</div>
                  <div style={{ marginTop: 8 }}>
                    <strong>Objetivo:</strong>{' '}
                    <select
                      value={missaoAtual.objetivo_id || ''}
                      disabled={modoBloqueado || ['concluida', 'cancelada'].includes(missaoAtual.estado)}
                      onChange={async (e) => {
                        await associarObjetivoMissao(missaoAtual.id, e.target.value ? Number(e.target.value) : null)
                        await atualizarDados()
                        const atualizadas = await obterMissoes()
                        setMissoes(atualizadas)
                        const atualizada = atualizadas.find(m => m.id === missaoAtual.id)
                        if (atualizada) setDetalhe({ tipo: 'missao', dados: atualizada })
                      }}
                      style={{ padding: 6, borderRadius: 6, marginLeft: 4 }}
                    >
                      <option value="">Sem objetivo associado</option>
                      {objetivos.filter(o => !o.arquivado).map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                  </div>
                  {missaoAtual.descricao && <div style={{ marginTop: 8 }}>{missaoAtual.descricao}</div>}
                </div>

                <div style={styles.itemCard}>
                  <strong>Indicadores objetivos</strong>
                  <div>⏱️ Tempo decorrido: {formatarDuracao(estatisticasMissao?.tempo_decorrido_segundos)}</div>
                  <div>🚓 Recursos: {estatisticasMissao?.total_recursos ?? recursosMissao.length}</div>
                  <div>👥 Elementos: {estatisticasMissao?.total_elementos ?? '—'}</div>
                  <div>📋 Ordens relacionadas: {estatisticasMissao?.total_ordens ?? '—'}</div>
                  <div>🕒 Última atualização: {formatarDataHora(estatisticasMissao?.ultima_atualizacao || missaoAtual.atualizada_em)}</div>
                  <div>📍 Ocorrência: {ocorrenciaMissao?.titulo || 'Sem ocorrência associada'}</div>
                </div>

                <div style={styles.itemCard}>
                  <strong>Situação operacional</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {[
                      ['sob_controlo', '🟢 Sob controlo'],
                      ['estavel', '🟡 Estável'],
                      ['complexa', '🟠 Complexa'],
                      ['critica', '🔴 Crítica'],
                      ['necessita_reforco', '⚫ Necessita de reforço']
                    ].map(([id, rotulo]) => (
                      <button
                        key={id}
                        disabled={modoBloqueado || missaoAtual.situacao_operacional === id || ['concluida', 'cancelada'].includes(missaoAtual.estado)}
                        style={{ ...styles.smallButton, background: missaoAtual.situacao_operacional === id ? '#7c3aed' : '#64748b' }}
                        onClick={async () => {
                          await alterarSituacaoMissao(missaoAtual.id, id)
                          const atualizadas = await obterMissoes()
                          setMissoes(atualizadas)
                          const atualizada = atualizadas.find(m => m.id === missaoAtual.id)
                          if (atualizada) setDetalhe({ tipo: 'missao', dados: atualizada })
                        }}
                      >{rotulo}</button>
                    ))}
                  </div>
                </div>

                <div style={styles.itemCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <strong>Equipa da missão</strong>
                    <button
                      style={styles.smallButton}
                      disabled={modoBloqueado || ['concluida', 'cancelada'].includes(missaoAtual.estado)}
                      onClick={() => setMissaoParaAtribuir(missaoAtual)}
                    >
                      Gerir recursos
                    </button>
                  </div>
                  {recursosMissao.length === 0 ? (
                    <div style={{ color: '#64748b', marginTop: 8 }}>Ainda não existem recursos atribuídos.</div>
                  ) : (
                    recursosMissao.map((recurso) => (
                      <div key={recurso.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <span>{recurso.indicativo_radio || recurso.nome} — {recurso.tipo}</span>
                        <button
                          style={{ ...styles.smallButton, background: '#b91c1c' }}
                          disabled={modoBloqueado || ['concluida', 'cancelada'].includes(missaoAtual.estado)}
                          onClick={async () => {
                            await removerRecursoMissao(missaoAtual.id, recurso.id)
                            await atualizarDados()
                            const atualizadas = await obterMissoes()
                            const atualizada = atualizadas.find(m => m.id === missaoAtual.id)
                            if (atualizada) setDetalhe({ tipo: 'missao', dados: atualizada })
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div style={styles.itemCard}>
                  <strong>Diário operacional</strong>
                  {!modoBloqueado && !['concluida', 'cancelada'].includes(missaoAtual.estado) && (
                    <div style={{ marginTop: 8 }}>
                      <input style={styles.input} placeholder="Autor" value={novaNotaMissao.autor}
                        onChange={(e) => setNovaNotaMissao({ ...novaNotaMissao, autor: e.target.value })} />
                      <textarea style={{ ...styles.input, minHeight: 70, resize: 'vertical' }}
                        placeholder="Registar informação operacional..." value={novaNotaMissao.texto}
                        onChange={(e) => setNovaNotaMissao({ ...novaNotaMissao, texto: e.target.value })} />
                      <button style={styles.smallButton} disabled={!novaNotaMissao.texto.trim()}
                        onClick={async () => {
                          await adicionarNotaMissao(missaoAtual.id, novaNotaMissao)
                          setNovaNotaMissao({ autor: novaNotaMissao.autor || 'Operador', texto: '' })
                          const [notas, eventos, estatisticas] = await Promise.all([
                            obterNotasMissao(missaoAtual.id), obterTimelineMissao(missaoAtual.id), obterEstatisticasMissao(missaoAtual.id)
                          ])
                          setNotasMissao(notas); setTimelineMissao(eventos); setEstatisticasMissao(estatisticas)
                        }}>Registar nota</button>
                    </div>
                  )}
                  {notasMissao.length === 0 ? <div style={{ color: '#64748b', marginTop: 8 }}>Sem notas registadas.</div> :
                    notasMissao.slice(0, 10).map(nota => (
                      <div key={nota.id} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                        <div><strong>{nota.autor || 'Operador'}</strong> · {formatarDataHora(nota.criado_em)}</div>
                        <div>{nota.texto}</div>
                      </div>
                    ))}
                </div>

                <div style={styles.itemCard}>
                  <strong>Timeline da missão</strong>
                  {timelineMissao.length === 0 ? <div style={{ color: '#64748b', marginTop: 8 }}>Sem acontecimentos registados.</div> :
                    timelineMissao.slice(0, 12).map(evento => (
                      <div key={evento.id} style={{ marginTop: 8 }}>
                        <strong>{formatarDataHora(evento.criado_em)}</strong> — {evento.descricao}
                      </div>
                    ))}
                </div>

                <div style={styles.itemCard}>
                  <strong>Estado da missão</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {estadosMissao.map(([id, rotulo]) => (
                      <button
                        key={id}
                        disabled={modoBloqueado || missaoAtual.estado === id || ['concluida', 'cancelada'].includes(missaoAtual.estado)}
                        style={{
                          ...styles.smallButton,
                          background: missaoAtual.estado === id ? '#7c3aed' : '#64748b'
                        }}
                        onClick={async () => {
                          await alterarEstadoMissao(missaoAtual.id, id)
                          await atualizarDados()
                          const atualizadas = await obterMissoes()
                          const atualizada = atualizadas.find(m => m.id === missaoAtual.id)
                          if (atualizada) setDetalhe({ tipo: 'missao', dados: atualizada })
                        }}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )
          })()}

          {detalhe.tipo === 'ocorrencia' && (() => {
            const ocorrenciaAtual = ocorrencias.find(o => o.id === detalhe.dados.id) || detalhe.dados
            const estados = [
              ['recebida', 'Recebida'],
              ['despachada', 'Despachada'],
              ['em_curso', 'Em curso'],
              ['sob_controlo', 'Sob controlo'],
              ['encerrada', 'Encerrada'],
              ['arquivada', 'Arquivada']
            ]
            const indiceAtual = estados.findIndex(([id]) => id === ocorrenciaAtual.estado)
            return (
              <>
                <div style={{ ...styles.itemCard, border: '2px solid #dc2626' }}>
                  <h3 style={{ margin: 0 }}>📍 {ocorrenciaAtual.titulo}</h3>
                  <div style={{ color: '#64748b', marginBottom: 10 }}>{ocorrenciaAtual.tipo} · {ocorrenciaAtual.ilha}</div>
                  <div><strong>Estado:</strong> {estados.find(([id]) => id === ocorrenciaAtual.estado)?.[1] || ocorrenciaAtual.estado}</div>
                  <div><strong>Cronómetro:</strong> <CronometroOcorrencia
                    recebidaEm={estatisticasOcorrencia?.recebida_em}
                    encerradaEm={estatisticasOcorrencia?.encerrada_em}
                    totalSegundos={estatisticasOcorrencia?.tempo_total_segundos}
                  /></div>
                  {ocorrenciaAtual.descricao && <div style={{ marginTop: 8 }}>{ocorrenciaAtual.descricao}</div>}
                </div>

                <div style={styles.itemCard}>
                  <strong>Etapas da ocorrência</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {estados.map(([id, rotulo], indice) => (
                      <button
                        key={id}
                        disabled={modoBloqueado || indice < indiceAtual || ocorrenciaAtual.estado === 'arquivada'}
                        onClick={async () => {
                          await alterarEstadoOcorrencia(ocorrenciaAtual.id, id)
                          await atualizarDados()
                          const atualizada = (await obterOcorrencias()).find(o => o.id === ocorrenciaAtual.id)
                          if (atualizada) setDetalhe({ tipo: 'ocorrencia', dados: atualizada })
                        }}
                        style={{
                          ...styles.smallButton,
                          background: indice === indiceAtual ? '#2563eb' : indice < indiceAtual ? '#16a34a' : '#64748b',
                          opacity: indice < indiceAtual ? 0.75 : 1
                        }}
                      >
                        {indice < indiceAtual ? '✓ ' : ''}{rotulo}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={styles.itemCard}>
                  <strong>📊 Estatísticas automáticas</strong>
                  <div>Receção: {formatarDataHora(estatisticasOcorrencia?.recebida_em)}</div>
                  <div>Despacho: {formatarDataHora(estatisticasOcorrencia?.despachada_em)}</div>
                  <div>Primeira chegada: {formatarDataHora(estatisticasOcorrencia?.primeira_chegada_em)}</div>
                  <div>Sob controlo: {formatarDataHora(estatisticasOcorrencia?.sob_controlo_em)}</div>
                  <div>Encerramento: {formatarDataHora(estatisticasOcorrencia?.encerrada_em)}</div>
                  <div style={{ marginTop: 7 }}>Tempo até despacho: {formatarDuracao(estatisticasOcorrencia?.tempo_ate_despacho_segundos)}</div>
                  <div>Tempo de resposta: {formatarDuracao(estatisticasOcorrencia?.tempo_resposta_segundos)}</div>
                  <div>Duração total: {formatarDuracao(estatisticasOcorrencia?.tempo_total_segundos)}</div>
                  <div style={{ marginTop: 7 }}>Recursos envolvidos: {estatisticasOcorrencia?.recursos_envolvidos ?? 0}</div>
                  <div>Recursos atuais: {estatisticasOcorrencia?.recursos_atuais ?? 0}</div>
                  <div>Elementos atuais: {estatisticasOcorrencia?.elementos_atuais ?? 0}</div>
                  <div>Ordens emitidas: {estatisticasOcorrencia?.ordens_emitidas ?? 0}</div>
                </div>

                <div style={styles.itemCard}>
                  <strong>🚓 Recursos no terreno</strong>
                  {recursos.filter(r => r.ocorrencia_id === ocorrenciaAtual.id).length === 0 && <div>Nenhum recurso atribuído.</div>}
                  {recursos.filter(r => r.ocorrencia_id === ocorrenciaAtual.id).map(r => (
                    <div key={r.id} style={{ cursor: 'pointer', color: '#2563eb', marginTop: 5 }} onClick={() => setDetalhe({ tipo: 'recurso', dados: r })}>
                      {r.indicativo_radio || r.nome} — {r.estado}
                    </div>
                  ))}
                </div>

                <div style={{ ...styles.itemCard, border: '2px solid #7c3aed' }}>
                  <strong>🎯 Missões desta ocorrência</strong>
                  {missoes.filter(m => m.ocorrencia_id === ocorrenciaAtual.id).length === 0 ? (
                    <div style={{ color: '#64748b', marginTop: 8 }}>Ainda não existem missões para esta ocorrência.</div>
                  ) : (
                    missoes.filter(m => m.ocorrencia_id === ocorrenciaAtual.id).map(missao => (
                      <button
                        key={missao.id}
                        type="button"
                        onClick={() => setDetalhe({ tipo: 'missao', dados: missao })}
                        style={{
                          width: '100%',
                          marginTop: 8,
                          padding: '9px 10px',
                          border: '1px solid #c4b5fd',
                          borderRadius: 8,
                          background: '#f5f3ff',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: 700 }}>
                          <span>{missao.titulo}</span>
                          <span>Abrir →</span>
                        </div>
                        <div style={{ color: '#64748b', marginTop: 3 }}>
                          {{ recebida: 'Recebida', planeada: 'Planeada', em_execucao: 'Em execução', concluida: 'Concluída', cancelada: 'Cancelada' }[missao.estado] || missao.estado}
                          {' · '}
                          {{ sob_controlo: 'Sob controlo', estavel: 'Estável', complexa: 'Complexa', critica: 'Crítica', necessita_reforco: 'Necessita de reforço' }[missao.situacao_operacional] || 'Estável'}
                        </div>
                        <div style={{ color: '#7c3aed', marginTop: 3, fontSize: 12 }}>
                          Abrir para consultar recursos, notas e Timeline da missão.
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div style={styles.itemCard}>
                  <strong>🕘 Timeline da ocorrência</strong>
                  {timelineOcorrencia.length === 0 && <div>Sem acontecimentos registados.</div>}
                  {timelineOcorrencia.slice(0, 12).map(evento => (
                    <div key={evento.id} style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid #e2e8f0' }}>
                      <div>{evento.descricao}</div>
                      <small style={{ color: '#64748b' }}>{formatarDataHora(evento.criado_em)}</small>
                    </div>
                  ))}
                </div>

                <button
                  style={styles.mainButton}
                  disabled={modoBloqueado || ocorrenciaAtual.estado === 'encerrada' || ocorrenciaAtual.estado === 'arquivada'}
                  onClick={() => {
                    setDetalhe(null)
                    setFormMissao({ titulo: '', descricao: '', prioridade: 'media', responsavel: '', notas: '', ocorrencia_id: ocorrenciaAtual.id })
                    setMostrarFormMissao(true)
                  }}
                >
                  Criar missão para esta ocorrência
                </button>
              </>
            )
          })()}

          {detalhe.tipo !== 'recurso' && detalhe.tipo !== 'ocorrencia' && detalhe.tipo !== 'missao' && Object.entries(detalhe.dados).map(([key, value]) => {
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

          {historicoRecurso && (
              <div style={styles.itemCard}>
                <strong>📊 Estatísticas</strong>

                <div>Ocorrências: {historicoRecurso.total_ocorrencias}</div>

                <div>Missões: {historicoRecurso.total_missoes}</div>

                <div>Ordens executadas: {historicoRecurso.ordens_executadas}</div>
              </div>
            )}

          {detalhe.tipo === 'recurso' && historicoRecurso?.eventos?.length > 0 && (
            <div style={styles.itemCard}>
              <strong>🕘 Histórico recente</strong>
              {historicoRecurso.eventos.slice(0, 5).map(evento => (
                <div key={evento.id} style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid #e2e8f0' }}>
                  <div>{evento.descricao}</div>
                  <small style={{ color: '#64748b' }}>{new Date(evento.criado_em).toLocaleString('pt-PT')}</small>
                </div>
              ))}
            </div>
          )}

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
                style={{ ...styles.mainButton, background: '#dc2626' }}
                disabled={modoBloqueado}
                onClick={async () => {
                  const confirmar = window.confirm('Libertar este recurso da ocorrência e da missão atual?')
                  if (!confirmar) return
                  await libertarRecurso(detalhe.dados.id)
                  await refresh()
                  const atualizado = recursos.find(r => r.id === detalhe.dados.id)
                  if (atualizado) setDetalhe({ tipo: 'recurso', dados: atualizado })
                }}
              >
                Libertar recurso
              </button>

              <button
                style={styles.mainButton}
                onClick={() => {
                  setRecursoParaAtribuirOcorrencia(detalhe.dados)
                }}
              >
                Ordenar deslocação
              </button>

          {detalhe.dados.ocorrencia_id &&
            !historicoRecurso?.chegadas_registadas?.includes(detalhe.dados.ocorrencia_id) && (
              <button
                style={styles.mainButton}
                onClick={async () => {
                  await confirmarChegada(detalhe.dados.id)
                  await refresh()

                  // Atualiza também o histórico deste recurso
                  const dados = await obterHistoricoRecurso(detalhe.dados.id)
                  setHistoricoRecurso(dados)
                }}
              >
                Confirmar chegada ao local
              </button>
            )}

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

              <button
                style={styles.mainButton}
                onClick={() => {
                  setFormElemento({
                    nome: '',
                    funcao: '',
                    entidade: '',
                    indicativo_radio: '',
                    recurso_id: detalhe.dados.id
                  })

                  setMostrarFormElemento(true)
                }}
              >
                Adicionar elemento
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
                  onClick={async () => {
                    await concluirMissao(detalhe.dados.id)
                    await refresh()
                  }}
                >
                  Concluir missão
                </button>
              </>
            )}

            {detalhe.tipo === 'elemento' && (
              <>
                <button
                  style={styles.mainButton}
                  onClick={() => {
                    setElementoParaReembarcar(detalhe.dados)
                    setDetalhe(null)
                  }}
                >
                  Reembarcar em viatura
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

          <input
            style={styles.input}
            placeholder="Indicativo rádio"
            value={formRecurso.indicativo_radio}
            onChange={(e) =>
              setFormRecurso({ ...formRecurso, indicativo_radio: e.target.value })
            }
          />

          <button
            style={styles.mainButton}
            onClick={async () => {
              if (!formRecurso.nome || !formRecurso.tipo) return

              await criarRecurso({
                nome: formRecurso.nome,
                tipo: formRecurso.tipo,
                estado: 'disponivel',
                indicativo_radio: formRecurso.indicativo_radio,
                ilha: 'Terceira',
                latitude: posicaoNovoRecurso.latitude,
                longitude: posicaoNovoRecurso.longitude,
              })

              await refresh()

              setFormRecurso({
                nome: '',
                tipo: '',
                indicativo_radio: ''
              })

              setPosicaoNovoRecurso(null)
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

              criarOcorrencia({
                titulo: formOcorrencia.titulo,
                tipo: formOcorrencia.tipo,
                descricao: formOcorrencia.descricao,
                estado: 'aberta',
                ilha: 'Terceira',
                latitude: posicaoNovaOcorrencia.latitude,
                longitude: posicaoNovaOcorrencia.longitude,
              }).then(async () => {
                await refresh()
                setPosicaoNovaOcorrencia(null)
                setFormOcorrencia({ titulo: '', tipo: '', descricao: '' })
              })
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

          <input
            style={styles.input}
            placeholder="Responsável (opcional)"
            value={formMissao.responsavel}
            onChange={(e) =>
              setFormMissao({ ...formMissao, responsavel: e.target.value })
            }
          />

          <textarea
            style={{ ...styles.input, minHeight: 70, resize: 'vertical' }}
            placeholder="Notas operacionais (opcional)"
            value={formMissao.notas}
            onChange={(e) =>
              setFormMissao({ ...formMissao, notas: e.target.value })
            }
          />

          <select
            style={styles.input}
            value={formMissao.situacao_operacional}
            onChange={(e) => setFormMissao({ ...formMissao, situacao_operacional: e.target.value })}
          >
            <option value="sob_controlo">Sob controlo</option>
            <option value="estavel">Estável</option>
            <option value="complexa">Complexa</option>
            <option value="critica">Crítica</option>
            <option value="necessita_reforco">Necessita de reforço</option>
          </select>

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
            onClick={async () => {
              if (!formMissao.titulo) return

              await criarMissao({
                titulo: formMissao.titulo,
                descricao: formMissao.descricao,
                prioridade: formMissao.prioridade,
                estado: 'planeada',
                responsavel: formMissao.responsavel || null,
                notas: formMissao.notas || null,
                situacao_operacional: formMissao.situacao_operacional || 'estavel',
                recurso_id: null,
                ocorrencia_id: formMissao.ocorrencia_id
              })

              await refresh()

              setMostrarFormMissao(false)

              setFormMissao({
                titulo: '',
                descricao: '',
                prioridade: 'media',
                responsavel: '',
                notas: '',
                situacao_operacional: 'estavel',
                ocorrencia_id: null
              })
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

      {missaoParaAtribuir && (() => {
        const idsAtribuidos = missaoParaAtribuir.recurso_ids || []
        const recursosAtribuidos = recursos.filter(r => idsAtribuidos.includes(r.id))
        const recursosDisponiveis = recursos.filter(r => !idsAtribuidos.includes(r.id))
        return (
          <div style={styles.detailPanel}>
            <div style={styles.panelTitle}>
              Recursos da missão
            </div>
            <div style={{ marginBottom: 12, color: '#64748b' }}>
              {missaoParaAtribuir.titulo}
            </div>

            <strong>Já atribuídos ({recursosAtribuidos.length})</strong>
            {recursosAtribuidos.length === 0 ? (
              <div style={{ ...styles.itemCard, color: '#64748b' }}>Nenhum recurso atribuído.</div>
            ) : recursosAtribuidos.map(r => (
              <div key={r.id} style={{ ...styles.itemCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  <strong>{r.indicativo_radio || r.nome}</strong>
                  <div>{r.tipo}</div>
                </div>
                <button
                  style={{ ...styles.smallButton, background: '#b91c1c' }}
                  disabled={modoBloqueado}
                  onClick={async () => {
                    await removerRecursoMissao(missaoParaAtribuir.id, r.id)
                    const atualizadas = await obterMissoes()
                    setMissoes(atualizadas)
                    const atualizada = atualizadas.find(m => m.id === missaoParaAtribuir.id)
                    if (atualizada) {
                      setMissaoParaAtribuir(atualizada)
                      if (detalhe?.tipo === 'missao' && detalhe.dados.id === atualizada.id) {
                        setDetalhe({ tipo: 'missao', dados: atualizada })
                      }
                    }
                    const recursosAtualizados = await obterRecursos()
                    setRecursos(recursosAtualizados)
                  }}
                >
                  Remover
                </button>
              </div>
            ))}

            <strong style={{ display: 'block', marginTop: 14 }}>Adicionar recurso</strong>
            {recursosDisponiveis.length === 0 ? (
              <div style={{ ...styles.itemCard, color: '#64748b' }}>Todos os recursos já estão atribuídos.</div>
            ) : recursosDisponiveis.map(r => (
              <div
                key={r.id}
                style={{ ...styles.itemCard, cursor: modoBloqueado ? 'default' : 'pointer' }}
                onClick={async () => {
                  if (modoBloqueado) return
                  await atribuirRecursoMissao(missaoParaAtribuir.id, r.id)
                  const atualizadas = await obterMissoes()
                  setMissoes(atualizadas)
                  const atualizada = atualizadas.find(m => m.id === missaoParaAtribuir.id)
                  if (atualizada) {
                    setMissaoParaAtribuir(atualizada)
                    if (detalhe?.tipo === 'missao' && detalhe.dados.id === atualizada.id) {
                      setDetalhe({ tipo: 'missao', dados: atualizada })
                    }
                  }
                  const recursosAtualizados = await obterRecursos()
                  setRecursos(recursosAtualizados)
                }}
              >
                <strong>{r.indicativo_radio || r.nome}</strong>
                <div>{r.tipo} · {r.estado}</div>
              </div>
            ))}

            <button
              style={styles.mainButton}
              onClick={() => setMissaoParaAtribuir(null)}
            >
              Fechar
            </button>
          </div>
        )
      })()}

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
            onClick={async () => {
              if (!formOrdem.titulo) return

              await criarOrdem({
                titulo: formOrdem.titulo,
                descricao: formOrdem.descricao,
                estado: 'emitida',
                recurso_id: formOrdem.recurso_id,
                ocorrencia_id: formOrdem.ocorrencia_id
              })

              await refresh()

              setMostrarFormOrdem(false)

              setFormOrdem({
                titulo: '',
                descricao: '',
                recurso_id: null,
                ocorrencia_id: null
              })
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
               onClick={async () => {
                 await atribuirOcorrencia(recursoParaAtribuirOcorrencia.id, o.id)

                setRecursoParaAtribuirOcorrencia(null)

                await refresh()
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

      {mostrarFormElemento && (
        <div style={styles.detailPanel}>
          <div style={styles.panelTitle}>Novo elemento</div>

          <input
            style={styles.input}
            placeholder="Nome"
            value={formElemento.nome}
            onChange={(e) =>
              setFormElemento({ ...formElemento, nome: e.target.value })
            }
          />

          <input
            style={styles.input}
            placeholder="Função"
            value={formElemento.funcao}
            onChange={(e) =>
              setFormElemento({ ...formElemento, funcao: e.target.value })
            }
          />

          <input
            style={styles.input}
            placeholder="Entidade"
            value={formElemento.entidade}
            onChange={(e) =>
              setFormElemento({ ...formElemento, entidade: e.target.value })
            }
          />

          <input
            style={styles.input}
            placeholder="Indicativo rádio"
            value={formElemento.indicativo_radio}
            onChange={(e) =>
              setFormElemento({ ...formElemento, indicativo_radio: e.target.value })
            }
          />

          <button
            style={styles.mainButton}
            onClick={async () => {
                if (!formElemento.nome) return

                await criarElemento({
                  nome: formElemento.nome,
                  funcao: formElemento.funcao,
                  entidade: formElemento.entidade,
                  estado: 'disponivel',
                  indicativo_radio: formElemento.indicativo_radio,
                  recurso_id: formElemento.recurso_id,
                  ocorrencia_id: null,
                  latitude: null,
                  longitude: null
                })

                await refresh()

                setMostrarFormElemento(false)

                setFormElemento({
                  nome: '',
                  funcao: '',
                  entidade: '',
                  indicativo_radio: '',
                  recurso_id: null
                })
              }}
          >
            Criar elemento
          </button>

          <button
            style={styles.mainButton}
            onClick={() => setMostrarFormElemento(false)}
          >
            Cancelar
          </button>
        </div>
      )}

      {elementoParaReembarcar && (
        <div style={styles.detailPanel}>
          <div style={styles.panelTitle}>Reembarcar elemento</div>

          <div>
            <strong>Elemento:</strong> {elementoParaReembarcar.nome}
          </div>

          <br />

          {recursos.map(r => (
            <div
              key={r.id}
              style={{ ...styles.itemCard, cursor: 'pointer' }}
              onClick={async () => {
                await reembarcarElemento(elementoParaReembarcar.id, r.id)
                setElementoParaReembarcar(null)
                await refresh()
              }}
            >
              <strong>{r.nome}</strong>
              <div>{r.tipo} · {r.estado}</div>
            </div>
          ))}

          <button
            style={styles.mainButton}
            onClick={() => setElementoParaReembarcar(null)}
          >
            Cancelar
          </button>
        </div>
      )}

      {modoConsulta && (
        <div style={styles.modoConsultaAviso}>
          OPERAÇÃO CONCLUÃDA — MODO DE CONSULTA
        </div>
      )}

      {modoReplay && (
        <div style={styles.modoReplayAviso}>
          🎬 MODO REPLAY — {replayEventoAtual ? `${new Date(replayEventoAtual.criado_em).toLocaleTimeString('pt-PT', { timeZone: 'Atlantic/Azores', hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ${replayEventoAtual.descricao}` : 'A preparar acontecimentos…'}
        </div>
      )}

      {!modoBloqueado && (
        <>
          <div style={{
            ...styles.modoMapaAviso,
            ...(modoMapa.tipo === 'normal' ? styles.modoMapaNormal : styles.modoMapaAtivo)
          }}>
            <strong>{modoMapa.tipo === 'normal' ? '🟢 Modo: Normal' :
              modoMapa.tipo === 'nova_ocorrencia' ? '📍 Modo: Nova ocorrência — clique no local' :
              modoMapa.tipo === 'novo_recurso' ? '🚓 Modo: Novo recurso — clique no local' :
              modoMapa.tipo === 'apear_elemento' ? `👤 Modo: Apear ${modoMapa.alvo?.nome || 'elemento'} — clique no destino` :
              'Modo operacional'}</strong>
            {modoMapa.tipo !== 'normal' && (
              <button type="button" onClick={() => setModoMapa({ tipo: 'normal', alvo: null })} style={styles.cancelarModoButton}>
                Cancelar (Esc)
              </button>
            )}
          </div>
          <div style={styles.mapaToolbar}>
            <button
              type="button"
              style={{ ...styles.mapaToolButton, ...(modoMapa.tipo === 'nova_ocorrencia' ? styles.mapaToolButtonActive : {}) }}
              onClick={() => setModoMapa({ tipo: 'nova_ocorrencia', alvo: null })}
            >
              📍 Nova ocorrência
            </button>
            <button
              type="button"
              style={{ ...styles.mapaToolButton, ...(modoMapa.tipo === 'novo_recurso' ? styles.mapaToolButtonActive : {}) }}
              onClick={() => setModoMapa({ tipo: 'novo_recurso', alvo: null })}
            >
              🚓 Novo recurso
            </button>
            <button
              type="button"
              style={styles.mapaToolButton}
              onClick={() => setModoMapa({ tipo: 'normal', alvo: null })}
              disabled={modoMapa.tipo === 'normal'}
            >
              🛑 Cancelar modo
            </button>
          </div>
        </>
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

          <GestorCliquesMapa
              modoMapa={modoMapa}
              refresh={refresh}
              modoConsulta={modoBloqueado}
              concluirModo={() => setModoMapa({ tipo: 'normal', alvo: null })}
          />

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
            
            const totalElementos = elementos.filter(el => el.recurso_id === r.id).length    

            return (
              <Marker
                key={r.id}
                position={[r.latitude, r.longitude]}
                draggable={!modoBloqueado}
                icon={L.divIcon({
                  className: '',
                  html: `<div style="
                    position: relative;
                    width: 36px;
                    height: 36px;
                    font-size: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  ">
                    ${obterIconeRecurso(r.tipo)}
                    <span style="
                      position: absolute;
                      top: 50%;
                      right: -22px;
                      transform: translateY(-50%);
                      background: black;
                      color: white;
                      border-radius: 50%;
                      font-size: 10px;
                      padding: 3px 6px;
                      border: 1px solid white;
                    ">
                      ${totalElementos}
                    </span>
                  </div>`,
                  iconSize: [18, 18],
                  iconAnchor: [9, 9],
                })}
                eventHandlers={{
                  click: async () => {
                    setDetalhe({
                      tipo: 'recurso',
                      dados: r
                    })

                    const data = await obterHistoricoRecurso(r.id)
                    setHistoricoRecurso(data)
                  },
                  dragstart: () => {
                    // Durante o arrasto, o Leaflet controla sozinho a posição do marcador.
                    // Não atualizamos estado React por pixel para evitar recriar o Marker.
                    arrastoMapaRef.current = true
                  },
                  dragend: async (e) => {
                    const { lat, lng } = e.target.getLatLng()

                    try {
                      await atualizarPosicaoRecurso(r.id, lat, lng)
                      setRecursos((atuais) =>
                        atuais.map((item) =>
                          item.id === r.id ? { ...item, latitude: lat, longitude: lng } : item
                        )
                      )
                    } catch (erro) {
                      console.error('Erro ao guardar a posição do recurso:', erro)
                      alert('Não foi possível guardar a nova posição do recurso.')
                      await atualizarDados()
                    } finally {
                      arrastoMapaRef.current = false
                    }
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
                  {r.indicativo_radio ? ` (${r.indicativo_radio})` : ''}
                </Tooltip>
              </Marker>
            )
          })}

          {mostrarLigacoesMissoes && missoesFiltradas.flatMap((missao) => {
            const ocorrencia = ocorrencias.find((o) => o.id === missao.ocorrencia_id)
            if (!ocorrencia?.latitude || !ocorrencia?.longitude) return []

            const cor = obterCorSituacaoMissao(missao.situacao_operacional, missao.estado)
            const selecionada = detalhe?.tipo === 'missao' && detalhe.dados.id === missao.id

            return recursos
              .filter((recurso) => (missao.recurso_ids || []).includes(recurso.id) && recurso.latitude && recurso.longitude)
              .map((recurso) => (
                <Polyline
                  key={`ligacao-missao-${missao.id}-recurso-${recurso.id}`}
                  positions={[
                    [ocorrencia.latitude, ocorrencia.longitude],
                    [recurso.latitude, recurso.longitude]
                  ]}
                  pathOptions={{
                    color: cor,
                    weight: selecionada ? 5 : 3,
                    opacity: selecionada ? 0.95 : 0.65,
                    dashArray: missao.estado === 'em_execucao' ? undefined : '8 8'
                  }}
                  interactive={false}
                >
                  <Tooltip sticky>
                    {missao.titulo} → {recurso.indicativo_radio || recurso.nome}
                  </Tooltip>
                </Polyline>
              ))
          })}

          {ocorrenciasFiltradas.map((o) =>
            o.latitude && o.longitude ? (
              <>
                <CircleMarker
                  key={`oc-${o.id}`}
                  center={[o.latitude, o.longitude]}
                  radius={10}
                  pathOptions={{
                    color: obterCorOcorrencia(o.tipo, o.estado)
                  }}
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

                {(() => {
                  const missoesOcorrencia = missoes.filter((m) => m.ocorrencia_id === o.id)

                  return missoesOcorrencia.map((m, indice) => {
                    const color = obterCorSituacaoMissao(m.situacao_operacional, m.estado)
                    const selecionada = detalhe?.tipo === 'missao' && detalhe.dados.id === m.id
                    const totalRecursos = (m.recurso_ids || []).length
                    const posicaoIcone = obterPosicaoIconeMissao(
                      o.latitude,
                      o.longitude,
                      indice,
                      missoesOcorrencia.length
                    )

                    return (
                      <Marker
                        key={`missao-${m.id}`}
                        position={posicaoIcone}
                        icon={criarIconeMissao(color, selecionada)}
                        zIndexOffset={selecionada ? 1200 : 900}
                        eventHandlers={{
                          click: (e) => {
                            L.DomEvent.stopPropagation(e.originalEvent)
                            setDetalhe({ tipo: 'missao', dados: m })
                          }
                        }}
                      >
                        <Tooltip direction="top" offset={[0, -12]}>
                          <strong>{m.titulo}</strong><br />
                          Estado: {m.estado}<br />
                          Situação: {m.situacao_operacional || 'estavel'}<br />
                          Recursos: {totalRecursos}<br />
                          Clique no alvo para abrir a missão.
                        </Tooltip>
                      </Marker>
                    )
                  })
                })()}
              </>
            ) : null
          )}

          {elementos.map((el) =>
            el.latitude && el.longitude ? (
              <Marker
                key={`elemento-${el.id}`}
                position={[el.latitude, el.longitude]}
                draggable={!modoBloqueado}
                icon={L.divIcon({
                  className: '',
                  html: `<div style="
                    font-size: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  ">🚶</div>`,
                  iconSize: [22, 22],
                  iconAnchor: [11, 11],
                })}
                eventHandlers={{
                  click: () => {
                    setDetalhe({
                      tipo: 'elemento',
                      dados: el
                    })
                  },
                  dragstart: () => {
                    arrastoMapaRef.current = true
                  },
                  dragend: async (e) => {
                    const { lat, lng } = e.target.getLatLng()

                    try {
                      await atualizarPosicaoElemento(el.id, lat, lng)
                      setElementos((atuais) =>
                        atuais.map((item) =>
                          item.id === el.id ? { ...item, latitude: lat, longitude: lng } : item
                        )
                      )
                    } catch (erro) {
                      console.error('Erro ao guardar a posição do elemento:', erro)
                      alert('Não foi possível guardar a nova posição do elemento.')
                      await atualizarDados()
                    } finally {
                      arrastoMapaRef.current = false
                    }
                  }
                }}
              >
                <Tooltip permanent direction="top">
                  {el.nome}
                  {el.indicativo_radio ? ` (${el.indicativo_radio})` : ''}
                </Tooltip>
              </Marker>
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
  commandStrip: {
    position: 'absolute', top: '56px', left: 0, right: 0, height: '52px', zIndex: 1190,
    background: 'rgba(30,41,59,.96)', color: 'white', display: 'flex', alignItems: 'center', gap: '22px',
    padding: '7px 16px', boxSizing: 'border-box', borderBottom: '1px solid rgba(255,255,255,.1)', fontSize: '13px'
  },
  commandLabel: { display: 'block', fontSize: '9px', letterSpacing: '.08em', opacity: .65, marginBottom: '2px' },
  globalSearchWrap: { marginLeft: 'auto', width: '360px', position: 'relative' },
  globalSearch: { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '8px', border: '1px solid #64748b', background: '#f8fafc', color: '#0f172a' },
  searchResults: { position: 'absolute', top: '42px', left: 0, right: 0, background: 'white', borderRadius: '8px', boxShadow: '0 10px 28px rgba(0,0,0,.35)', overflow: 'hidden', zIndex: 4000 },
  searchResult: { width: '100%', border: 0, borderBottom: '1px solid #e2e8f0', background: 'white', padding: '9px 11px', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column' },
  alertPanel: { position: 'absolute', top: '116px', right: '282px', width: '310px', maxHeight: '240px', overflowY: 'auto', zIndex: 1180, background: 'rgba(255,255,255,.96)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.28)', padding: '9px' },
  alertHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 3px 8px' },
  alertClose: { border: 0, background: 'transparent', fontSize: '20px', cursor: 'pointer' },
  alertItem: { display: 'flex', gap: '8px', padding: '8px 4px', borderTop: '1px solid #e2e8f0', fontSize: '12px' },
  showAlertsButton: { position: 'absolute', top: '116px', right: '282px', zIndex: 1180, border: '1px solid #cbd5e1', borderRadius: '8px', background: 'white', padding: '8px 10px', cursor: 'pointer' },
  leftPanel: {
    position: 'absolute',
    top: '116px',
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
    top: '116px',
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
  operacaoAtiva: {
    position: 'fixed',
    top: '64px',
    left: '220px',
    zIndex: 3000,
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '6px 8px 6px 12px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.96)',
    color: '#0f172a',
    boxShadow: '0 4px 14px rgba(0,0,0,.25)',
    fontFamily: 'Arial, sans-serif',
    fontSize: '13px',
  },
  operacaoAtivaLabel: {
    display: 'block',
    fontSize: '9px',
    color: '#64748b',
    letterSpacing: '0.08em',
  },
  backupButton: {
    border: '1px solid #7c3aed', borderRadius: '7px', padding: '7px 11px',
    background: '#ede9fe', color: '#5b21b6', cursor: 'pointer', fontWeight: 'bold',
  },
  backupPanel: {
    width: 'min(760px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
    background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 24px 70px rgba(0,0,0,.4)', color: '#0f172a',
  },
  backupWarning: { marginTop: '12px', padding: '11px 13px', borderRadius: '9px', background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', fontSize: '13px' },
  backupToolbar: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' },
  backupCreateButton: { border: 'none', borderRadius: '8px', padding: '10px 14px', background: '#6d28d9', color: '#fff', cursor: 'pointer', fontWeight: 'bold' },
  backupRefreshButton: { border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px', background: '#fff', color: '#334155', cursor: 'pointer', fontWeight: 'bold' },
  backupSuccess: { marginTop: '12px', padding: '10px', borderRadius: '8px', background: '#dcfce7', color: '#166534', border: '1px solid #86efac' },
  backupList: { display: 'grid', gap: '9px', marginTop: '15px' },
  backupItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#f8fafc' },
  backupName: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  backupMeta: { marginTop: '4px', color: '#64748b', fontSize: '12px' },
  backupCorrupt: { marginTop: '4px', color: '#b91c1c', fontSize: '12px', fontWeight: 'bold' },
  backupActions: { display: 'flex', gap: '7px', flexShrink: 0 },
  backupRestoreButton: { border: '1px solid #15803d', borderRadius: '7px', padding: '7px 10px', background: '#dcfce7', color: '#166534', cursor: 'pointer', fontWeight: 'bold' },
  backupDeleteButton: { border: '1px solid #b91c1c', borderRadius: '7px', padding: '7px 10px', background: '#fee2e2', color: '#991b1b', cursor: 'pointer', fontWeight: 'bold' },
  systemButton: {
    border: '1px solid #0f766e',
    borderRadius: '7px',
    padding: '7px 11px',
    background: '#ccfbf1',
    color: '#115e59',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  systemOverlay: {
    position: 'fixed', inset: 0, zIndex: 5200,
    display: 'grid', placeItems: 'center',
    background: 'rgba(15,23,42,.62)',
    backdropFilter: 'blur(2px)',
    fontFamily: 'Arial, sans-serif',
  },
  systemPanel: {
    width: 'min(650px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
    background: '#fff', borderRadius: '16px', padding: '20px',
    boxShadow: '0 24px 70px rgba(0,0,0,.4)', color: '#0f172a',
  },
  systemGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginTop: '16px' },
  systemCard: { border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#f8fafc' },
  systemCardTitle: { fontSize: '12px', color: '#64748b', fontWeight: 'bold', letterSpacing: '.04em' },
  systemCardValue: { marginTop: '5px', fontSize: '16px', fontWeight: 'bold' },
  systemFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '18px' },
  systemRefresh: { border: 'none', borderRadius: '8px', padding: '10px 14px', background: '#0f766e', color: '#fff', cursor: 'pointer', fontWeight: 'bold' },
  systemError: { marginTop: '12px', padding: '10px', borderRadius: '8px', background: '#fee2e2', color: '#991b1b' },
  replayButton: {
    border: '1px solid #1d4ed8',
    borderRadius: '7px',
    padding: '7px 11px',
    background: '#dbeafe',
    color: '#1e3a8a',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  replayOverlay: {
    position: 'fixed', inset: 0, zIndex: 5000,
    display: 'grid', placeItems: 'center',
    background: 'rgba(15,23,42,.58)',
    backdropFilter: 'blur(2px)',
    fontFamily: 'Arial, sans-serif',
  },
  replayPanel: {
    width: 'min(620px, calc(100vw - 32px))',
    background: '#ffffff', borderRadius: '16px', padding: '20px',
    boxShadow: '0 24px 70px rgba(0,0,0,.38)',
    border: '1px solid #cbd5e1', color: '#0f172a',
  },
  replayHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' },
  replayEyebrow: { fontSize: '11px', color: '#64748b', letterSpacing: '.08em', fontWeight: 'bold' },
  replayTitle: { margin: '4px 0 0', fontSize: '25px' },
  replayClose: { border: 'none', background: '#f1f5f9', width: '34px', height: '34px', borderRadius: '8px', cursor: 'pointer', fontSize: '23px', lineHeight: 1 },
  replayNotice: { marginTop: '16px', padding: '12px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: '13px', lineHeight: 1.45 },
  replayControls: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px', marginTop: '20px' },
  replayControlButton: { border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', borderRadius: '9px', cursor: 'pointer', fontWeight: 'bold', color: '#334155' },
  replayPrimaryButton: { border: '1px solid #1d4ed8', background: '#1d4ed8', color: '#fff', padding: '10px 18px', borderRadius: '9px', cursor: 'pointer', fontWeight: 'bold' },
  replaySpeedSection: { marginTop: '22px', textAlign: 'center', fontSize: '13px' },
  replaySpeedRow: { display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '9px' },
  replaySpeedButton: { minWidth: '52px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 'bold', color: '#334155' },
  replaySpeedButtonActive: { background: '#0f172a', color: '#fff', borderColor: '#0f172a' },
  replayTimelineBox: { marginTop: '22px', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc' },
  replayTimelineLabels: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' },
  replayRange: { width: '100%', margin: '9px 0' },
  replayStatus: { textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: '#334155' },
  modoMapaAviso: { position: 'fixed', top: '112px', left: '50%', transform: 'translateX(-50%)', zIndex: 3200, maxWidth: 'min(820px, calc(100vw - 40px))', padding: '9px 14px', borderRadius: '999px', fontFamily: 'Arial, sans-serif', fontSize: '12px', boxShadow: '0 5px 16px rgba(0,0,0,.22)', display: 'flex', alignItems: 'center', gap: 12 },
  modoMapaNormal: { background: '#ecfdf5', color: '#166534', border: '1px solid #86efac' },
  modoMapaAtivo: { background: '#fff7ed', color: '#9a3412', border: '1px solid #fb923c' },
  cancelarModoButton: { border: '1px solid currentColor', borderRadius: 999, background: 'rgba(255,255,255,.78)', color: 'inherit', padding: '4px 9px', cursor: 'pointer', fontWeight: 700 },
  mapaToolbar: { position: 'fixed', top: '158px', left: '50%', transform: 'translateX(-50%)', zIndex: 3150, display: 'flex', gap: 7, padding: 7, borderRadius: 12, background: 'rgba(15,23,42,.92)', boxShadow: '0 6px 18px rgba(0,0,0,.26)' },
  mapaToolButton: { border: '1px solid #475569', borderRadius: 8, background: '#1e293b', color: '#f8fafc', padding: '7px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 12 },
  mapaToolButtonActive: { background: '#ea580c', borderColor: '#fb923c' },
  modoReplayAviso: { position: 'fixed', top: '112px', left: '50%', transform: 'translateX(-50%)', zIndex: 3100, maxWidth: 'min(760px, calc(100vw - 40px))', padding: '9px 18px', borderRadius: '999px', background: '#312e81', color: '#ffffff', border: '1px solid #818cf8', fontFamily: 'Arial, sans-serif', fontWeight: 'bold', fontSize: '12px', boxShadow: '0 5px 16px rgba(0,0,0,.28)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  replayEventCard: { marginTop: '16px', padding: '14px', borderRadius: '11px', background: '#0f172a', color: '#ffffff' },
  replayEventMeta: { fontSize: '11px', color: '#bfdbfe', fontWeight: 'bold', letterSpacing: '.04em' },
  replayEventDescription: { marginTop: '7px', fontSize: '15px', lineHeight: 1.4, fontWeight: 'bold' },
  replayEventList: { marginTop: '14px', maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' },
  replayEventRow: { width: '100%', display: 'grid', gridTemplateColumns: '82px 1fr', gap: '10px', textAlign: 'left', padding: '9px 11px', border: 'none', borderBottom: '1px solid #e2e8f0', background: '#ffffff', cursor: 'pointer', color: '#334155' },
  replayEventRowActive: { background: '#dbeafe', color: '#1e3a8a', fontWeight: 'bold' },
  replayEmpty: { marginTop: '18px', padding: '18px', textAlign: 'center', color: '#64748b', border: '1px dashed #cbd5e1', borderRadius: '10px' },
  replayError: { marginTop: '14px', padding: '10px', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' },
  trocarOperacaoButton: {
    border: '1px solid #cbd5e1',
    borderRadius: '7px',
    padding: '7px 9px',
    background: '#f8fafc',
    color: '#334155',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  encerrarOperacaoButton: { border: '1px solid #b91c1c', borderRadius: '7px', padding: '7px 9px', background: '#fee2e2', color: '#991b1b', cursor: 'pointer', fontWeight: 'bold' },
  reabrirOperacaoButton: { border: '1px solid #15803d', borderRadius: '7px', padding: '7px 9px', background: '#dcfce7', color: '#166534', cursor: 'pointer', fontWeight: 'bold' },
  modoConsultaAviso: { position: 'fixed', top: '112px', left: '50%', transform: 'translateX(-50%)', zIndex: 2900, padding: '8px 16px', borderRadius: '999px', background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', fontFamily: 'Arial, sans-serif', fontWeight: 'bold', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,.2)' },
}

function App() {
  const [operacaoAtiva, setOperacaoAtiva] = useState(undefined)
  const [mostrarReplay, setMostrarReplay] = useState(false)
  const [replayAtivo, setReplayAtivo] = useState(false)
  const [velocidadeReplay, setVelocidadeReplay] = useState(1)
  const [eventosReplay, setEventosReplay] = useState([])
  const [indiceReplay, setIndiceReplay] = useState(0)
  const [replayAcarregar, setReplayAcarregar] = useState(false)
  const [erroReplay, setErroReplay] = useState('')
  const [mostrarSistema, setMostrarSistema] = useState(false)
  const [diagnostico, setDiagnostico] = useState(null)
  const [diagnosticoAcarregar, setDiagnosticoAcarregar] = useState(false)
  const [erroDiagnostico, setErroDiagnostico] = useState('')
  const [mostrarBackups, setMostrarBackups] = useState(false)
  const [backups, setBackups] = useState([])
  const [backupsAcarregar, setBackupsAcarregar] = useState(false)
  const [backupEmCurso, setBackupEmCurso] = useState(false)
  const [mensagemBackup, setMensagemBackup] = useState('')
  const [erroBackup, setErroBackup] = useState('')

  async function atualizarDiagnostico() {
    setDiagnosticoAcarregar(true)
    setErroDiagnostico('')
    try {
      setDiagnostico(await obterDiagnostico())
    } catch (erro) {
      console.error(erro)
      setErroDiagnostico('Não foi possível contactar a API do SGO.')
      setDiagnostico(null)
    } finally {
      setDiagnosticoAcarregar(false)
    }
  }

  function abrirEstadoSistema() {
    setMostrarSistema(true)
    atualizarDiagnostico()
  }

  async function carregarBackups() {
    setBackupsAcarregar(true)
    setErroBackup('')
    try {
      setBackups(await obterBackups())
    } catch (erro) {
      console.error(erro)
      setErroBackup('Não foi possível carregar os backups.')
    } finally {
      setBackupsAcarregar(false)
    }
  }

  function abrirBackups() {
    setMostrarBackups(true)
    setMensagemBackup('')
    carregarBackups()
  }

  async function criarNovoBackup() {
    setBackupEmCurso(true)
    setErroBackup('')
    setMensagemBackup('')
    try {
      const resultado = await criarBackup()
      setMensagemBackup(`Backup criado com sucesso: ${resultado.nome} (${resultado.registos} registos).`)
      await carregarBackups()
    } catch (erro) {
      console.error(erro)
      setErroBackup('Não foi possível criar o backup.')
    } finally {
      setBackupEmCurso(false)
    }
  }

  async function restaurarBackupSelecionado(nome) {
    const confirmacao = window.prompt(
      `ATENÇÃO: o estado atual do SGO será substituído pelo backup ${nome}.\n\nEscreva RESTAURAR para confirmar.`
    )
    if (confirmacao !== 'RESTAURAR') return
    setBackupEmCurso(true)
    setErroBackup('')
    setMensagemBackup('')
    try {
      const resultado = await restaurarBackup(nome, confirmacao)
      // Evita manter no ecrã referências a registos que acabaram de ser substituídos.
      setDetalhe(null)
      setEstatisticasOcorrencia(null)
      setTimelineOcorrencia([])
      setMostrarBackups(false)
      setMensagemBackup(`Backup restaurado com sucesso (${resultado.registos_restaurados} registos). A aplicação será atualizada.`)
      // Recarregamento sem cache para obter imediatamente o estado restaurado.
      window.setTimeout(() => {
        const url = new URL(window.location.href)
        url.searchParams.set('_restauro', Date.now().toString())
        window.location.replace(url.toString())
      }, 500)
    } catch (erro) {
      console.error(erro)
      setErroBackup(erro?.message || 'Não foi possível restaurar o backup. O estado atual foi mantido.')
    } finally {
      setBackupEmCurso(false)
    }
  }

  async function eliminarBackupSelecionado(nome) {
    if (!window.confirm(`Eliminar definitivamente o backup ${nome}?`)) return
    setBackupEmCurso(true)
    setErroBackup('')
    setMensagemBackup('')
    try {
      await eliminarBackup(nome)
      setMensagemBackup('Backup eliminado.')
      await carregarBackups()
    } catch (erro) {
      console.error(erro)
      setErroBackup('Não foi possível eliminar o backup.')
    } finally {
      setBackupEmCurso(false)
    }
  }

  const eventoReplayAtual = eventosReplay[indiceReplay] || null

  async function abrirReplay() {
    setMostrarReplay(true)
    setReplayAtivo(false)
    setReplayAcarregar(true)
    setErroReplay('')
    try {
      const eventos = await obterTimeline()
      const cronologicos = [...eventos].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em))
      setEventosReplay(cronologicos)
      setIndiceReplay(0)
    } catch (erro) {
      console.error(erro)
      setErroReplay('Não foi possível carregar os acontecimentos da operação.')
      setEventosReplay([])
    } finally {
      setReplayAcarregar(false)
    }
  }

  function fecharReplay() {
    setReplayAtivo(false)
    setMostrarReplay(false)
  }

  function irInicioReplay() {
    setReplayAtivo(false)
    setIndiceReplay(0)
  }

  function proximoEventoReplay() {
    setReplayAtivo(false)
    setIndiceReplay((indice) => Math.min(indice + 1, Math.max(0, eventosReplay.length - 1)))
  }

  useEffect(() => {
    if (!mostrarReplay || !replayAtivo || eventosReplay.length < 2) return undefined
    if (indiceReplay >= eventosReplay.length - 1) {
      setReplayAtivo(false)
      return undefined
    }
    const intervalo = window.setTimeout(() => {
      setIndiceReplay((indice) => Math.min(indice + 1, eventosReplay.length - 1))
    }, Math.max(180, 1400 / velocidadeReplay))
    return () => window.clearTimeout(intervalo)
  }, [mostrarReplay, replayAtivo, indiceReplay, velocidadeReplay, eventosReplay.length])

  useEffect(() => {
    if (indiceReplay >= eventosReplay.length - 1 && replayAtivo) setReplayAtivo(false)
  }, [indiceReplay, eventosReplay.length, replayAtivo])

  useEffect(() => {
    function teclaReplay(evento) {
      if (!mostrarReplay) return
      if (evento.code === 'Space') {
        evento.preventDefault()
        setReplayAtivo((valor) => !valor)
      }
      if (evento.key === 'ArrowRight') proximoEventoReplay()
      if (evento.key === 'Home') irInicioReplay()
      if (evento.key === 'Escape') fecharReplay()
    }
    window.addEventListener('keydown', teclaReplay)
    return () => window.removeEventListener('keydown', teclaReplay)
  }, [mostrarReplay, eventosReplay.length])

  useEffect(() => {
    obterOperacaoAtiva()
      .then(setOperacaoAtiva)
      .catch(() => setOperacaoAtiva(null))
  }, [])

  async function voltarAoGestor() {
    await desativarOperacao()
    setOperacaoAtiva(null)
  }

  async function encerrarAtual() {
    const confirmar = window.confirm(`Encerrar a operação "${operacaoAtiva.nome}"?\n\nDepois de encerrada, ficará disponível apenas para consulta até ser reaberta.`)
    if (!confirmar) return
    await encerrarOperacao(operacaoAtiva.id)
    setOperacaoAtiva(await obterOperacaoAtiva())
  }

  async function reabrirAtual() {
    const confirmar = window.confirm(`Reabrir a operação "${operacaoAtiva.nome}"?`)
    if (!confirmar) return
    await reabrirOperacao(operacaoAtiva.id)
    setOperacaoAtiva(await obterOperacaoAtiva())
  }

  if (operacaoAtiva === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', color: 'white', fontFamily: 'Arial, sans-serif' }}>
        A iniciar o SGO...
      </div>
    )
  }

  if (!operacaoAtiva) {
    return <Operacoes onAbrir={setOperacaoAtiva} />
  }

  return (
    <>
      <CentroOperacoes modoConsulta={operacaoAtiva.estado === 'concluida'} modoReplay={mostrarReplay} replayEventoAtual={eventoReplayAtual} operacaoAtiva={operacaoAtiva} />
      <div style={styles.operacaoAtiva}>
        <div>
          <span style={styles.operacaoAtivaLabel}>OPERAÇÃO ATIVA</span>
          <strong>{operacaoAtiva.nome}</strong>
        </div>
        {operacaoAtiva.estado === 'concluida' ? (
          <button style={styles.reabrirOperacaoButton} onClick={reabrirAtual}>Reabrir operação</button>
        ) : (
          <button style={styles.encerrarOperacaoButton} onClick={encerrarAtual}>Encerrar operação</button>
        )}
        <button style={styles.systemButton} onClick={abrirEstadoSistema}>
          ⚙ Estado do Sistema
        </button>
        <button style={styles.backupButton} onClick={abrirBackups}>
          💾 Backups
        </button>
        <button style={styles.replayButton} onClick={abrirReplay}>
          ▶ Replay
        </button>
        <button style={styles.trocarOperacaoButton} onClick={voltarAoGestor}>
          Trocar operação
        </button>
      </div>

      {mostrarBackups && (
        <div style={styles.systemOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !backupEmCurso) setMostrarBackups(false) }}>
          <div style={styles.backupPanel}>
            <div style={styles.replayHeader}>
              <div>
                <div style={styles.replayEyebrow}>SEGURANÇA DOS DADOS</div>
                <h2 style={styles.replayTitle}>Backup e Restauro</h2>
              </div>
              <button style={styles.replayClose} onClick={() => setMostrarBackups(false)} disabled={backupEmCurso} aria-label="Fechar">×</button>
            </div>

            <div style={styles.backupWarning}>
              Os backups ficam guardados na pasta <strong>backups</strong> do projeto. Antes de restaurar, confirme que escolheu o ficheiro correto.
            </div>

            <div style={styles.backupToolbar}>
              <button style={styles.backupCreateButton} onClick={criarNovoBackup} disabled={backupEmCurso}>
                {backupEmCurso ? 'A processar…' : '＋ Criar backup agora'}
              </button>
              <button style={styles.backupRefreshButton} onClick={carregarBackups} disabled={backupEmCurso || backupsAcarregar}>
                Atualizar lista
              </button>
            </div>

            {mensagemBackup && <div style={styles.backupSuccess}>{mensagemBackup}</div>}
            {erroBackup && <div style={styles.systemError}>{erroBackup}</div>}

            {backupsAcarregar ? (
              <div style={styles.replayEmpty}>A carregar backups…</div>
            ) : backups.length === 0 ? (
              <div style={styles.replayEmpty}>Ainda não existem backups.</div>
            ) : (
              <div style={styles.backupList}>
                {backups.map((backup) => (
                  <div key={backup.nome} style={styles.backupItem}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={styles.backupName}>{backup.nome}</strong>
                      <div style={styles.backupMeta}>
                        {backup.criado_em ? new Date(backup.criado_em).toLocaleString('pt-PT', { timeZone: 'Atlantic/Azores' }) : 'Data indisponível'}
                        {' · '}{backup.registos ?? 0} registos
                        {' · '}{Math.max(1, Math.round((backup.tamanho_bytes || 0) / 1024))} KB
                      </div>
                      {backup.corrompido && <div style={styles.backupCorrupt}>Ficheiro inválido ou corrompido</div>}
                    </div>
                    <div style={styles.backupActions}>
                      <button style={styles.backupRestoreButton} onClick={() => restaurarBackupSelecionado(backup.nome)} disabled={backupEmCurso || backup.corrompido}>Restaurar</button>
                      <button style={styles.backupDeleteButton} onClick={() => eliminarBackupSelecionado(backup.nome)} disabled={backupEmCurso}>Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {mostrarSistema && (
        <div style={styles.systemOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setMostrarSistema(false) }}>
          <div style={styles.systemPanel}>
            <div style={styles.replayHeader}>
              <div>
                <div style={styles.replayEyebrow}>DIAGNÓSTICO E MANUTENÇÃO</div>
                <h2 style={styles.replayTitle}>Estado do Sistema</h2>
              </div>
              <button style={styles.replayClose} onClick={() => setMostrarSistema(false)} aria-label="Fechar">×</button>
            </div>

            {erroDiagnostico && <div style={styles.systemError}>{erroDiagnostico}</div>}
            {diagnosticoAcarregar && !diagnostico ? (
              <div style={styles.replayEmpty}>A verificar o sistema…</div>
            ) : diagnostico ? (
              <>
                <div style={styles.systemGrid}>
                  {[
                    ['API', diagnostico.api],
                    ['Base de dados', diagnostico.base_dados],
                    ['Timeline', diagnostico.timeline],
                    ['Replay', diagnostico.replay],
                  ].map(([titulo, item]) => (
                    <div key={titulo} style={styles.systemCard}>
                      <div style={styles.systemCardTitle}>{item?.ok ? '🟢' : '🔴'} {titulo}</div>
                      <div style={styles.systemCardValue}>{item?.mensagem || 'Sem informação'}</div>
                    </div>
                  ))}
                  <div style={styles.systemCard}>
                    <div style={styles.systemCardTitle}>🟢 POLLING</div>
                    <div style={styles.systemCardValue}>{diagnostico.polling?.intervalo_segundos || 5} segundos</div>
                  </div>
                  <div style={styles.systemCard}>
                    <div style={styles.systemCardTitle}>{diagnostico.operacao ? '🟢' : '🟡'} OPERAÇÃO ATIVA</div>
                    <div style={styles.systemCardValue}>{diagnostico.operacao?.nome || 'Nenhuma'}</div>
                  </div>
                  <div style={styles.systemCard}>
                    <div style={styles.systemCardTitle}>RECURSOS / ELEMENTOS</div>
                    <div style={styles.systemCardValue}>{diagnostico.contagens?.recursos ?? 0} / {diagnostico.contagens?.elementos ?? 0}</div>
                  </div>
                  <div style={styles.systemCard}>
                    <div style={styles.systemCardTitle}>OCORRÊNCIAS / ORDENS</div>
                    <div style={styles.systemCardValue}>{diagnostico.contagens?.ocorrencias ?? 0} / {diagnostico.contagens?.ordens ?? 0}</div>
                  </div>
                </div>
                {diagnostico.erro && <div style={styles.systemError}>{diagnostico.erro}</div>}
                <div style={styles.systemFooter}>
                  <small>Última verificação: {new Date(diagnostico.verificado_em).toLocaleString('pt-PT', { timeZone: 'Atlantic/Azores' })}</small>
                  <button style={styles.systemRefresh} onClick={atualizarDiagnostico} disabled={diagnosticoAcarregar}>
                    {diagnosticoAcarregar ? 'A verificar…' : 'Atualizar diagnóstico'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {mostrarReplay && (
        <div style={styles.replayOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) fecharReplay() }}>
          <div style={styles.replayPanel}>
            <div style={styles.replayHeader}>
              <div>
                <div style={styles.replayEyebrow}>OPERAÇÃO: {operacaoAtiva.nome}</div>
                <h2 style={styles.replayTitle}>Replay Operacional</h2>
              </div>
              <button style={styles.replayClose} onClick={fecharReplay} aria-label="Fechar">×</button>
            </div>

            <div style={styles.replayNotice}>
              Modo seguro de consulta. Os acontecimentos são reproduzidos por ordem cronológica e os comandos operacionais ficam bloqueados enquanto este painel estiver aberto.
            </div>

            {erroReplay && <div style={styles.replayError}>{erroReplay}</div>}
            {replayAcarregar ? (
              <div style={styles.replayEmpty}>A carregar acontecimentos…</div>
            ) : eventosReplay.length === 0 ? (
              <div style={styles.replayEmpty}>Esta operação ainda não possui acontecimentos na Timeline.</div>
            ) : (
              <>
                <div style={styles.replayControls}>
                  <button style={styles.replayControlButton} onClick={irInicioReplay}>⏮ Início</button>
                  <button style={styles.replayPrimaryButton} onClick={() => setReplayAtivo((valor) => !valor)}>
                    {replayAtivo ? '⏸ Pausar' : '▶ Reproduzir'}
                  </button>
                  <button style={styles.replayControlButton} onClick={proximoEventoReplay}>⏭ Próximo evento</button>
                </div>

                <div style={styles.replaySpeedSection}>
                  <strong>Velocidade</strong>
                  <div style={styles.replaySpeedRow}>
                    {[1, 2, 5, 10].map((valor) => (
                      <button key={valor} style={{...styles.replaySpeedButton, ...(velocidadeReplay === valor ? styles.replaySpeedButtonActive : {})}} onClick={() => setVelocidadeReplay(valor)}>
                        {valor}×
                      </button>
                    ))}
                  </div>
                </div>

                <div style={styles.replayTimelineBox}>
                  <div style={styles.replayTimelineLabels}>
                    <span>{new Date(eventosReplay[0].criado_em).toLocaleTimeString('pt-PT', { timeZone: 'Atlantic/Azores', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    <span>{new Date(eventosReplay[eventosReplay.length - 1].criado_em).toLocaleTimeString('pt-PT', { timeZone: 'Atlantic/Azores', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  <input type="range" min="0" max={Math.max(0, eventosReplay.length - 1)} value={indiceReplay} onChange={(e) => { setReplayAtivo(false); setIndiceReplay(Number(e.target.value)) }} style={styles.replayRange} />
                  <div style={styles.replayStatus}>{replayAtivo ? `A reproduzir a ${velocidadeReplay}×` : 'Replay em pausa'} · Evento {indiceReplay + 1} de {eventosReplay.length}</div>
                </div>

                {eventoReplayAtual && (
                  <div style={styles.replayEventCard}>
                    <div style={styles.replayEventMeta}>{eventoReplayAtual.tipo?.toUpperCase()} · {new Date(eventoReplayAtual.criado_em).toLocaleString('pt-PT', { timeZone: 'Atlantic/Azores' })}</div>
                    <div style={styles.replayEventDescription}>{eventoReplayAtual.descricao}</div>
                  </div>
                )}

                <div style={styles.replayEventList}>
                  {eventosReplay.map((evento, indice) => (
                    <button key={evento.id} type="button" style={{ ...styles.replayEventRow, ...(indice === indiceReplay ? styles.replayEventRowActive : {}) }} onClick={() => { setReplayAtivo(false); setIndiceReplay(indice) }}>
                      <span>{new Date(evento.criado_em).toLocaleTimeString('pt-PT', { timeZone: 'Atlantic/Azores', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      <span>{evento.descricao}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default App



