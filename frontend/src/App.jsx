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
  const [resumoRecursosOperacionais, setResumoRecursosOperacionais] = useState([])
  const [recursoOperacionalExpandido, setRecursoOperacionalExpandido] = useState(null)
  const [detalheRecursoOperacional, setDetalheRecursoOperacional] = useState(null)
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
    estado: 'planeada',
    responsavel: '',
    notas: '',
    situacao_operacional: 'estavel',
    ocorrencia_id: null,
    objetivo_id: null
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
  const [intencaoComandante, setIntencaoComandante] = useState(operacaoAtiva?.intencao_comandante || '')
  const [aGuardarIntencao, setAGuardarIntencao] = useState(false)
  const [mensagemIntencao, setMensagemIntencao] = useState('')
  const [decisoesOperacionais, setDecisoesOperacionais] = useState([])
  const [novaDecisaoOperacional, setNovaDecisaoOperacional] = useState('')
  const [aGuardarDecisao, setAGuardarDecisao] = useState(false)
  const [mensagemDecisao, setMensagemDecisao] = useState('')
  const [gruposPAOAbertos, setGruposPAOAbertos] = useState({})
  const [secaoPAOAberta, setSecaoPAOAberta] = useState(null)
  const [missaoPAOExpandida, setMissaoPAOExpandida] = useState(null)
  const [objetivoPAOExpandido, setObjetivoPAOExpandido] = useState(null)
  const modoBloqueado = modoConsulta || modoReplay

  useEffect(() => {
    setIntencaoComandante(operacaoAtiva?.intencao_comandante || '')
    setMensagemIntencao('')
  }, [operacaoAtiva?.id, operacaoAtiva?.intencao_comandante])

  useEffect(() => {
    setNovaDecisaoOperacional('')
    setMensagemDecisao('')
    if (!operacaoAtiva?.id) {
      setDecisoesOperacionais([])
      return
    }
    fetch(`http://127.0.0.1:8000/operacoes/${operacaoAtiva.id}/decisoes`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Não foi possível carregar as decisões.')))
      .then(setDecisoesOperacionais)
      .catch(console.error)
  }, [operacaoAtiva?.id])

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
        elementosData,
        resumoRecursosOperacionaisData
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
        obterElementos(),
        fetch('http://127.0.0.1:8000/recursos-operacionais/resumo').then(r => r.ok ? r.json() : [])
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
      setResumoRecursosOperacionais(resumoRecursosOperacionaisData)
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
    const larguraPagina = 210
    const margem = 20
    const larguraTexto = larguraPagina - (margem * 2)
    const limiteInferior = 274
    const azulPSP = [0, 44, 119]
    const begePSP = [202, 176, 139]
    const cinzentoClaro = [226, 226, 226]
    const logoPSP = 'data:image/png;base64,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'

    const dataAtual = new Date().toLocaleString('pt-PT', {
      timeZone: 'Atlantic/Azores',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const nomeOperacao = operacaoAtiva?.nome || 'Operação'
    const estadoOperacao = modoReplay ? 'Replay' : (modoConsulta ? 'Encerrada' : 'Ativa')
    const intencaoComandante =
      operacaoAtiva?.intencao_comandante ||
      relatorio?.intencao_comandante ||
      'Não registada.'

    const textoEstado = (estado) => {
      const mapa = {
        ativa: 'Ativa',
        aberto: 'Aberto',
        aberta: 'Aberta',
        em_curso: 'Em curso',
        planeado: 'Planeado',
        em_preparacao: 'Em preparação',
        em_execucao: 'Em execução',
        suspenso: 'Suspenso',
        concluido: 'Concluído',
        concluida: 'Concluída',
        cancelado: 'Cancelado',
        cancelada: 'Cancelada',
        fechada: 'Fechada',
        encerrada: 'Encerrada'
      }
      return mapa[estado] || String(estado || 'Não definido').replaceAll('_', ' ')
    }

    const textoPrioridade = (prioridade) => {
      const mapa = { critica: 'Crítica', alta: 'Alta', normal: 'Normal', media: 'Média', baixa: 'Baixa' }
      return mapa[prioridade] || String(prioridade || 'Não definida')
    }

    const cabecalhoContinuacao = () => {
      doc.setFillColor(...azulPSP)
      doc.rect(0, 0, larguraPagina, 7, 'F')
      doc.addImage(logoPSP, 'PNG', margem, 13, 43, 10.3)

      doc.setTextColor(...azulPSP)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('RELATÓRIO OPERACIONAL', 190, 18, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(95, 95, 95)
      doc.text(nomeOperacao, 190, 24, { align: 'right' })

      doc.setFillColor(...begePSP)
      doc.rect(margem, 31, 28, 1, 'F')
      doc.setFillColor(...azulPSP)
      doc.rect(48, 31, 142, 1, 'F')
    }

    const novaPagina = () => {
      doc.addPage()
      cabecalhoContinuacao()
      return 43
    }

    const garantirEspaco = (y, alturaNecessaria) => {
      if (y + alturaNecessaria > limiteInferior) return novaPagina()
      return y
    }

    const tituloSecao = (numero, titulo, y) => {
      y = garantirEspaco(y, 18)
      doc.setFillColor(...begePSP)
      doc.rect(margem, y - 4.2, 9, 1.1, 'F')
      doc.setFillColor(...azulPSP)
      doc.rect(30, y - 4.2, 160, 1.1, 'F')
      doc.setTextColor(15, 23, 42)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text(`${numero}. ${titulo}`, margem, y + 4)
      return y + 15
    }

    const escreverTexto = (texto, x, y, largura = larguraTexto, tamanho = 9.5) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(tamanho)
      doc.setTextColor(35, 35, 35)
      const linhas = doc.splitTextToSize(String(texto || ''), largura)
      doc.text(linhas, x, y, { lineHeightFactor: 1.35 })
      return y + (linhas.length * tamanho * 0.47)
    }

    // Primeira página — identidade visual PSP já validada
    doc.setFillColor(...azulPSP)
    doc.rect(0, 0, larguraPagina, 7, 'F')
    doc.addImage(logoPSP, 'PNG', margem, 14, 57, 13.6)

    doc.setTextColor(...azulPSP)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('SGO', 190, 17, { align: 'right' })
    doc.setFontSize(9)
    doc.text('SISTEMA DE GESTÃO OPERACIONAL', 190, 24, { align: 'right' })

    doc.setFillColor(...begePSP)
    doc.rect(margem, 34, 35, 1.2, 'F')
    doc.setFillColor(...azulPSP)
    doc.rect(55, 34, 135, 1.2, 'F')

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(19)
    doc.text('RELATÓRIO OPERACIONAL', margem, 49)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(90, 90, 90)
    doc.text(`Gerado em: ${dataAtual} - Hora dos Açores`, margem, 57)

    tituloSecao(1, 'Identificação da operação', 70)

    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...azulPSP)
    doc.text('OPERAÇÃO', margem, 88)
    doc.text('ESTADO', margem, 100)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(25, 25, 25)
    doc.text(String(nomeOperacao), 50, 88)
    doc.text(String(estadoOperacao), 50, 100)

    tituloSecao(2, 'Intenção do Comandante', 119)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(25, 25, 25)
    const linhasIntencao = doc.splitTextToSize(String(intencaoComandante), larguraTexto)
    doc.text(linhasIntencao, margem, 137, { lineHeightFactor: 1.45 })

    let y = 137 + (linhasIntencao.length * 5.2) + 12

    // 3. Ocorrências
    y = tituloSecao(3, 'Ocorrências', y)

    if (ocorrencias.length === 0) {
      y = escreverTexto('Não existem ocorrências registadas.', margem, y)
    } else {
      ocorrencias.forEach((ocorrencia, indice) => {
        const descricao = ocorrencia.descricao ? String(ocorrencia.descricao) : ''
        const linhasDescricao = descricao ? doc.splitTextToSize(descricao, larguraTexto - 6) : []
        const alturaBloco = 17 + (linhasDescricao.length * 4.5)

        y = garantirEspaco(y, alturaBloco)

        doc.setFillColor(247, 248, 250)
        doc.roundedRect(margem, y - 4, larguraTexto, alturaBloco - 2, 1.5, 1.5, 'F')

        doc.setFillColor(...azulPSP)
        doc.rect(margem, y - 4, 2, alturaBloco - 2, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10.5)
        doc.setTextColor(...azulPSP)
        doc.text(`${indice + 1}. ${ocorrencia.titulo || `Ocorrência ${ocorrencia.id}`}`, margem + 6, y + 2)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(75, 75, 75)
        const meta = [
          ocorrencia.tipo ? `Tipo: ${ocorrencia.tipo}` : null,
          `Estado: ${textoEstado(ocorrencia.estado)}`
        ].filter(Boolean).join('  |  ')
        doc.text(meta, margem + 6, y + 8)

        if (linhasDescricao.length > 0) {
          doc.setTextColor(35, 35, 35)
          doc.setFontSize(9)
          doc.text(linhasDescricao, margem + 6, y + 14, { lineHeightFactor: 1.3 })
        }

        y += alturaBloco + 4
      })
    }

    y += 6

    // 4. Objetivos Operacionais — agrupados por ocorrência
    y = tituloSecao(4, 'Objetivos Operacionais', y)

    const objetivosVisiveis = objetivos.filter((objetivo) => !objetivo.arquivado)

    if (objetivosVisiveis.length === 0) {
      y = escreverTexto('Não existem objetivos operacionais registados.', margem, y)
    } else {
      const grupos = [
        ...ocorrencias.map((ocorrencia) => ({
          ocorrencia,
          objetivos: objetivosVisiveis.filter((objetivo) => Number(objetivo.ocorrencia_id) === Number(ocorrencia.id))
        })).filter((grupo) => grupo.objetivos.length > 0),
        {
          ocorrencia: null,
          objetivos: objetivosVisiveis.filter((objetivo) => !objetivo.ocorrencia_id)
        }
      ].filter((grupo) => grupo.objetivos.length > 0)

      grupos.forEach((grupo) => {
        y = garantirEspaco(y, 14)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10.5)
        doc.setTextColor(...azulPSP)
        doc.text(
          grupo.ocorrencia ? grupo.ocorrencia.titulo : 'Sem ocorrência associada',
          margem,
          y
        )
        y += 7

        grupo.objetivos.forEach((objetivo) => {
          const descricao = objetivo.descricao ? String(objetivo.descricao) : ''
          const linhasDescricao = descricao ? doc.splitTextToSize(descricao, larguraTexto - 10) : []
          const alturaBloco = 20 + (linhasDescricao.length * 4.4)

          y = garantirEspaco(y, alturaBloco)

          doc.setDrawColor(218, 223, 230)
          doc.roundedRect(margem, y - 4, larguraTexto, alturaBloco - 2, 1.5, 1.5, 'S')

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9.8)
          doc.setTextColor(25, 25, 25)
          doc.text(objetivo.nome || `Objetivo ${objetivo.id}`, margem + 5, y + 2)

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8.2)
          doc.setTextColor(80, 80, 80)
          const metaObjetivo = [
            `Estado: ${textoEstado(objetivo.estado)}`,
            `Prioridade: ${textoPrioridade(objetivo.prioridade)}`,
            objetivo.responsavel ? `Responsável: ${objetivo.responsavel}` : null
          ].filter(Boolean).join('  |  ')
          const linhasMeta = doc.splitTextToSize(metaObjetivo, larguraTexto - 10)
          doc.text(linhasMeta, margem + 5, y + 8, { lineHeightFactor: 1.25 })

          let yDescricao = y + 8 + (linhasMeta.length * 3.8)
          if (linhasDescricao.length > 0) {
            doc.setFontSize(8.8)
            doc.setTextColor(45, 45, 45)
            doc.text(linhasDescricao, margem + 5, yDescricao + 3, { lineHeightFactor: 1.3 })
          }

          y += alturaBloco + 4
        })

        y += 3
      })
    }


    y += 6

    // 5. Missões Operacionais
    y = tituloSecao(5, 'Missões Operacionais', y)

    const missoesVisiveis = missoes.filter((missao) => missao.estado !== 'cancelada')

    const textoSituacaoMissao = (situacao) => {
      const mapa = {
        sob_controlo: 'Sob controlo',
        estavel: 'Estável',
        complexa: 'Complexa',
        critica: 'Crítica',
        necessita_reforco: 'Necessita de reforço'
      }
      return mapa[situacao] || 'Não definida'
    }

    if (missoesVisiveis.length === 0) {
      y = escreverTexto('Não existem missões operacionais registadas.', margem, y)
    } else {
      const gruposMissoes = [
        ...ocorrencias.map((ocorrencia) => ({
          ocorrencia,
          missoes: missoesVisiveis.filter(
            (missao) => Number(missao.ocorrencia_id) === Number(ocorrencia.id)
          )
        })).filter((grupo) => grupo.missoes.length > 0),
        {
          ocorrencia: null,
          missoes: missoesVisiveis.filter((missao) => !missao.ocorrencia_id)
        }
      ].filter((grupo) => grupo.missoes.length > 0)

      gruposMissoes.forEach((grupo) => {
        const primeiraMissao = grupo.missoes[0]
        const primeiraDescricao = primeiraMissao?.descricao ? String(primeiraMissao.descricao) : ''
        const linhasPrimeiraDescricao = primeiraDescricao
          ? doc.splitTextToSize(primeiraDescricao, larguraTexto - 10)
          : []
        const alturaPrimeiraMissao = 34 + (linhasPrimeiraDescricao.length * 4.2)

        // Mantém o título do grupo junto da primeira missão.
        y = garantirEspaco(y, 14 + alturaPrimeiraMissao)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10.5)
        doc.setTextColor(...azulPSP)
        doc.text(
          grupo.ocorrencia ? grupo.ocorrencia.titulo : 'Sem ocorrência associada',
          margem,
          y
        )
        y += 7

        grupo.missoes.forEach((missao) => {
          const objetivo = objetivos.find(
            (objetivoItem) => Number(objetivoItem.id) === Number(missao.objetivo_id)
          )

          const idsRecursos = Array.isArray(missao.recurso_ids)
            ? missao.recurso_ids
            : (missao.recurso_id ? [missao.recurso_id] : [])

          const nomesRecursos = recursos
            .filter((recurso) => idsRecursos.some((id) => Number(id) === Number(recurso.id)))
            .map((recurso) => recurso.indicativo_radio || recurso.nome)
            .filter(Boolean)

          const descricao = missao.descricao ? String(missao.descricao) : ''
          const linhasDescricao = descricao
            ? doc.splitTextToSize(descricao, larguraTexto - 10)
            : []

          const metaMissao = [
            `Estado: ${textoEstado(missao.estado)}`,
            `Prioridade: ${textoPrioridade(missao.prioridade)}`,
            `Situação: ${textoSituacaoMissao(missao.situacao_operacional)}`
          ].join('  |  ')

          const linhasMeta = doc.splitTextToSize(metaMissao, larguraTexto - 10)

          const contexto = [
            objetivo ? `Objetivo: ${objetivo.nome}` : null,
            missao.responsavel ? `Responsável: ${missao.responsavel}` : null
          ].filter(Boolean).join('  |  ')

          const linhasContexto = contexto
            ? doc.splitTextToSize(contexto, larguraTexto - 10)
            : []

          const recursosTexto = nomesRecursos.length > 0
            ? `Recursos: ${nomesRecursos.join(', ')}`
            : 'Recursos: Sem recursos atribuídos'

          const linhasRecursos = doc.splitTextToSize(recursosTexto, larguraTexto - 10)

          const alturaBloco =
            17 +
            (linhasMeta.length * 3.8) +
            (linhasContexto.length * 3.8) +
            (linhasRecursos.length * 3.8) +
            (linhasDescricao.length * 4.2)

          y = garantirEspaco(y, alturaBloco)

          doc.setDrawColor(218, 223, 230)
          doc.roundedRect(margem, y - 4, larguraTexto, alturaBloco - 2, 1.5, 1.5, 'S')

          doc.setFillColor(...azulPSP)
          doc.rect(margem, y - 4, 2, alturaBloco - 2, 'F')

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9.8)
          doc.setTextColor(25, 25, 25)
          doc.text(missao.titulo || `Missão ${missao.id}`, margem + 5, y + 2)

          let yLinha = y + 8

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8.2)
          doc.setTextColor(80, 80, 80)
          doc.text(linhasMeta, margem + 5, yLinha, { lineHeightFactor: 1.25 })
          yLinha += linhasMeta.length * 3.8

          if (linhasContexto.length > 0) {
            doc.text(linhasContexto, margem + 5, yLinha, { lineHeightFactor: 1.25 })
            yLinha += linhasContexto.length * 3.8
          }

          doc.setTextColor(...azulPSP)
          doc.text(linhasRecursos, margem + 5, yLinha, { lineHeightFactor: 1.25 })
          yLinha += linhasRecursos.length * 3.8

          if (linhasDescricao.length > 0) {
            doc.setFontSize(8.8)
            doc.setTextColor(45, 45, 45)
            doc.text(linhasDescricao, margem + 5, yLinha + 2.5, { lineHeightFactor: 1.3 })
          }

          y += alturaBloco + 4
        })

        y += 3
      })
    }


    y += 6

    // 6. Recursos Operacionais
    y = tituloSecao(6, 'Recursos Operacionais', y)

    const formatarTempoRelatorio = (segundos = 0) => {
      const total = Math.max(0, Math.floor(Number(segundos) || 0))
      const dias = Math.floor(total / 86400)
      const horas = Math.floor((total % 86400) / 3600)
      const minutos = Math.floor((total % 3600) / 60)
      const segs = total % 60

      if (dias > 0) return `${dias}d ${horas}h ${minutos}m`
      if (horas > 0) return `${horas}h ${minutos}m`
      if (minutos > 0) return `${minutos}m ${segs}s`
      return `${segs}s`
    }

    if (resumoRecursosOperacionais.length === 0) {
      y = escreverTexto('Não existem recursos operacionais registados nesta operação.', margem, y)
    } else {
      const totalRecursos = resumoRecursosOperacionais.length
      const totalDisponiveis = resumoRecursosOperacionais.filter(
        (recurso) => recurso.estado === 'disponivel'
      ).length
      const totalEmMissao = resumoRecursosOperacionais.filter(
        (recurso) => recurso.estado === 'em_missao'
      ).length

      y = garantirEspaco(y, 17)

      doc.setFillColor(247, 248, 250)
      doc.roundedRect(margem, y - 4, larguraTexto, 13, 1.5, 1.5, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...azulPSP)
      doc.text(`Total: ${totalRecursos}`, margem + 5, y + 3)
      doc.text(`Disponíveis: ${totalDisponiveis}`, 82, y + 3)
      doc.text(`Em missão: ${totalEmMissao}`, 142, y + 3)

      y += 19

      resumoRecursosOperacionais.forEach((recurso) => {
        const nomeRecurso = recurso.indicativo_radio || recurso.nome || `Recurso ${recurso.recurso_id}`
        const identificacao = recurso.indicativo_radio && recurso.nome
          ? `${recurso.indicativo_radio} — ${recurso.nome}`
          : nomeRecurso

        const estadoRecurso = recurso.estado === 'disponivel'
          ? 'Disponível'
          : recurso.estado === 'em_missao'
            ? 'Em missão'
            : textoEstado(recurso.estado)

        const linhaPrincipal = [
          recurso.tipo ? `Tipo: ${recurso.tipo}` : null,
          `Estado: ${estadoRecurso}`,
          `Missões: ${Number(recurso.total_missoes) || 0}`
        ].filter(Boolean).join('  |  ')

        const linhaOcorrencia = recurso.ocorrencia_atual
          ? `Ocorrência atual: ${recurso.ocorrencia_atual}`
          : 'Ocorrência atual: —'

        const linhaTempo = recurso.estado === 'em_missao' && Number(recurso.empenho_atual_segundos) > 0
          ? `Tempo total empenhado: ${formatarTempoRelatorio(recurso.tempo_total_empenhado_segundos)}  |  Empenhamento atual: ${formatarTempoRelatorio(recurso.empenho_atual_segundos)}`
          : `Tempo total empenhado: ${formatarTempoRelatorio(recurso.tempo_total_empenhado_segundos)}`

        const linhasPrincipal = doc.splitTextToSize(linhaPrincipal, larguraTexto - 10)
        const linhasOcorrencia = doc.splitTextToSize(linhaOcorrencia, larguraTexto - 10)
        const linhasTempo = doc.splitTextToSize(linhaTempo, larguraTexto - 10)

        const alturaBloco =
          17 +
          (linhasPrincipal.length * 3.8) +
          (linhasOcorrencia.length * 3.8) +
          (linhasTempo.length * 3.8)

        y = garantirEspaco(y, alturaBloco)

        doc.setDrawColor(218, 223, 230)
        doc.roundedRect(margem, y - 4, larguraTexto, alturaBloco - 2, 1.5, 1.5, 'S')

        doc.setFillColor(...azulPSP)
        doc.rect(margem, y - 4, 2, alturaBloco - 2, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9.8)
        doc.setTextColor(25, 25, 25)
        doc.text(identificacao, margem + 5, y + 2)

        let yLinha = y + 8

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.2)
        doc.setTextColor(80, 80, 80)
        doc.text(linhasPrincipal, margem + 5, yLinha, { lineHeightFactor: 1.25 })
        yLinha += linhasPrincipal.length * 3.8

        doc.text(linhasOcorrencia, margem + 5, yLinha, { lineHeightFactor: 1.25 })
        yLinha += linhasOcorrencia.length * 3.8

        doc.setTextColor(...azulPSP)
        doc.text(linhasTempo, margem + 5, yLinha, { lineHeightFactor: 1.25 })

        y += alturaBloco + 4
      })
    }


    y += 6

    // 7. Decisões Operacionais
    y = tituloSecao(7, 'Decisões Operacionais', y)

    const decisoesOrdenadas = [...decisoesOperacionais].sort((a, b) => {
      const dataA = new Date(a.criado_em || 0).getTime()
      const dataB = new Date(b.criado_em || 0).getTime()
      return dataA - dataB
    })

    if (decisoesOrdenadas.length === 0) {
      y = escreverTexto('Não existem decisões operacionais registadas nesta operação.', margem, y)
    } else {
      decisoesOrdenadas.forEach((decisao, indice) => {
        const dataHora = decisao.criado_em
          ? new Date(decisao.criado_em).toLocaleString('pt-PT', {
              timeZone: 'Atlantic/Azores',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          : 'Data/hora não disponível'

        const autor = decisao.autor || 'Comandante'
        const textoDecisao = String(decisao.texto || '—')
        const linhasDecisao = doc.splitTextToSize(textoDecisao, larguraTexto - 10)
        const alturaBloco = 17 + (linhasDecisao.length * 4.2)

        y = garantirEspaco(y, alturaBloco)

        doc.setDrawColor(218, 223, 230)
        doc.roundedRect(margem, y - 4, larguraTexto, alturaBloco - 2, 1.5, 1.5, 'S')

        doc.setFillColor(...azulPSP)
        doc.rect(margem, y - 4, 2, alturaBloco - 2, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.6)
        doc.setTextColor(...azulPSP)
        doc.text(`${indice + 1}. ${dataHora}  |  ${autor}`, margem + 5, y + 2)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(35, 35, 35)
        doc.text(linhasDecisao, margem + 5, y + 9, { lineHeightFactor: 1.3 })

        y += alturaBloco + 4
      })
    }


    y += 6

    // 8. Cronologia Operacional
    y = tituloSecao(8, 'Cronologia Operacional', y)

    const cronologiaOrdenada = [...timeline].sort((a, b) => {
      const dataA = new Date(a.criado_em || 0).getTime()
      const dataB = new Date(b.criado_em || 0).getTime()
      return dataA - dataB
    })

    if (cronologiaOrdenada.length === 0) {
      y = escreverTexto('Não existem acontecimentos registados na cronologia desta operação.', margem, y)
    } else {
      cronologiaOrdenada.forEach((evento) => {
        const dataHora = evento.criado_em
          ? new Date(evento.criado_em).toLocaleString('pt-PT', {
              timeZone: 'Atlantic/Azores',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          : 'Data/hora não disponível'

        const tipoEvento = evento.tipo
          ? String(evento.tipo).replaceAll('_', ' ').replace(/\b\w/g, letra => letra.toUpperCase())
          : 'Evento'
        const descricaoEvento = String(evento.descricao || '—')
        const linhasDescricao = doc.splitTextToSize(descricaoEvento, larguraTexto - 10)
        const alturaBloco = 15 + (linhasDescricao.length * 4.1)

        y = garantirEspaco(y, alturaBloco)

        doc.setDrawColor(225, 228, 233)
        doc.line(margem + 2, y - 2, margem + 2, y + alturaBloco - 5)

        doc.setFillColor(...azulPSP)
        doc.circle(margem + 2, y, 1.6, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.3)
        doc.setTextColor(...azulPSP)
        doc.text(`${dataHora}  |  ${tipoEvento}`, margem + 7, y + 1)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.8)
        doc.setTextColor(40, 40, 40)
        doc.text(linhasDescricao, margem + 7, y + 7, { lineHeightFactor: 1.28 })

        y += alturaBloco
      })
    }

    // Rodapé em todas as páginas
    const totalPaginas = doc.getNumberOfPages()
    for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
      doc.setPage(pagina)
      doc.setFillColor(...cinzentoClaro)
      doc.rect(0, 282, larguraPagina, 1, 'F')
      doc.setFillColor(...azulPSP)
      doc.rect(0, 283, 45, 1.4, 'F')
      doc.setFillColor(...begePSP)
      doc.rect(45, 283, 18, 1.4, 'F')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(95, 95, 95)
      doc.text('SGO - Sistema de Gestão Operacional', margem, 290)
      doc.text(`Página ${pagina} de ${totalPaginas}`, 190, 290, { align: 'right' })
    }

    const nomeSeguro = String(nomeOperacao)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'operacao'

    doc.save(`relatorio_operacional_${nomeSeguro}.pdf`)
  }

  async function pedirDadosObjetivo(objetivo = null, ocorrenciaContexto = null) {
    const modeloEscolhido = !objetivo && modelosObjetivo.length > 0
      ? window.prompt(`MODELO DE OBJETIVO (opcional)\n\nPode escolher um modelo previamente guardado\nou deixar em branco para criar um objetivo novo.\n\n${modelosObjetivo.map(m => `${m.id} - ${m.nome}`).join('\n')}`, '')
      : null
    const modelo = modelosObjetivo.find(m => String(m.id) === String(modeloEscolhido))
    const nome = window.prompt('Nome do objetivo:', objetivo?.nome || modelo?.nome || '')
    if (nome === null || !nome.trim()) return null
    const descricao = window.prompt('Descrição:', objetivo?.descricao || modelo?.descricao || '') ?? ''
    const prioridade = window.prompt('Prioridade: critica, alta, normal ou baixa', objetivo?.prioridade || modelo?.prioridade || 'normal') || 'normal'
    const estado = window.prompt('Estado: planeado, em_preparacao, em_execucao, suspenso, concluido ou cancelado', objetivo?.estado || 'planeado') || 'planeado'
    const responsavel = window.prompt('Responsável (opcional):', objetivo?.responsavel || '') || null
    const ocorrenciaTexto = ocorrenciaContexto?.id
      ? String(ocorrenciaContexto.id)
      : window.prompt(`Ocorrência associada (ID, opcional):\n${ocorrencias.map(o => `${o.id} - ${o.titulo}`).join('\n')}`, objetivo?.ocorrencia_id || '')
    return {
      nome: nome.trim(), descricao, prioridade, estado, responsavel,
      ocorrencia_id: ocorrenciaTexto ? Number(ocorrenciaTexto) : null,
      modelo_id: objetivo?.modelo_id || modelo?.id || null,
      latitude: objetivo?.latitude || null, longitude: objetivo?.longitude || null,
      notas: objetivo?.notas || null, arquivado: objetivo?.arquivado || false
    }
  }

  async function novoObjetivo(ocorrenciaContexto = null) {
    const dados = await pedirDadosObjetivo(null, ocorrenciaContexto)
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

  async function alterarEstadoObjetivoPAO(objetivo, novoEstado) {
    if (modoBloqueado) return
    await atualizarObjetivo(objetivo.id, {
      nome: objetivo.nome,
      descricao: objetivo.descricao || '',
      prioridade: objetivo.prioridade || 'normal',
      estado: novoEstado,
      responsavel: objetivo.responsavel || null,
      ocorrencia_id: objetivo.ocorrencia_id || null,
      modelo_id: objetivo.modelo_id || null,
      latitude: objetivo.latitude || null,
      longitude: objetivo.longitude || null,
      notas: objetivo.notas || null,
      arquivado: objetivo.arquivado || false
    })
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

  async function guardarIntencaoComandante() {
    if (!operacaoAtiva?.id || modoBloqueado) return
    setAGuardarIntencao(true)
    setMensagemIntencao('')
    try {
      const resposta = await fetch(`http://127.0.0.1:8000/operacoes/${operacaoAtiva.id}/intencao-comandante`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intencao_comandante: intencaoComandante })
      })
      if (!resposta.ok) {
        const erro = await resposta.json().catch(() => null)
        throw new Error(erro?.detail || 'Não foi possível guardar a Intenção do Comandante.')
      }
      const dados = await resposta.json()
      setIntencaoComandante(dados.intencao_comandante || '')
      setMensagemIntencao('Intenção do Comandante guardada.')
    } catch (erro) {
      console.error(erro)
      setMensagemIntencao(erro.message || 'Não foi possível guardar a Intenção do Comandante.')
    } finally {
      setAGuardarIntencao(false)
    }
  }

  async function carregarDecisoesOperacionais() {
    if (!operacaoAtiva?.id) return setDecisoesOperacionais([])
    try {
      const r = await fetch(`http://127.0.0.1:8000/operacoes/${operacaoAtiva.id}/decisoes`)
      if (!r.ok) throw new Error('Não foi possível carregar as decisões.')
      setDecisoesOperacionais(await r.json())
    } catch (erro) { console.error(erro) }
  }

  async function guardarDecisaoOperacional() {
    const texto = novaDecisaoOperacional.trim()
    if (!texto || !operacaoAtiva?.id || modoBloqueado) return
    setAGuardarDecisao(true); setMensagemDecisao('')
    try {
      const r = await fetch(`http://127.0.0.1:8000/operacoes/${operacaoAtiva.id}/decisoes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, autor: 'Comandante' })
      })
      if (!r.ok) { const e = await r.json().catch(()=>null); throw new Error(e?.detail || 'Não foi possível guardar a decisão.') }
      setNovaDecisaoOperacional('')
      setMensagemDecisao('Decisão operacional registada.')
      await carregarDecisoesOperacionais()
    } catch (erro) { setMensagemDecisao(erro.message) }
    finally { setAGuardarDecisao(false) }
  }

  const totalObjetivosPAOEmAtencao = objetivos.filter((objetivo) => {
    if (objetivo.arquivado) return false
    return missoes.some((m) =>
      Number(m.objetivo_id) === Number(objetivo.id) &&
      !['concluida', 'cancelada'].includes(m.estado) &&
      ['critica', 'necessita_reforco'].includes(m.situacao_operacional)
    )
  }).length

  async function alternarDetalheRecursoOperacional(recurso) {
    if (Number(recursoOperacionalExpandido) === Number(recurso.recurso_id)) {
      setRecursoOperacionalExpandido(null)
      setDetalheRecursoOperacional(null)
      return
    }

    setRecursoOperacionalExpandido(recurso.recurso_id)
    setDetalheRecursoOperacional(null)
    try {
      const historico = await obterHistoricoRecurso(recurso.recurso_id)
      setDetalheRecursoOperacional(historico)
    } catch (erro) {
      console.error('Erro ao carregar detalhe operacional do recurso:', erro)
    }
  }

  function renderAba() {
    if (abaAtiva === 'recursos_operacionais') {
      const disponiveis = resumoRecursosOperacionais.filter(r => r.estado === 'disponivel').length
      const emMissao = resumoRecursosOperacionais.filter(r => r.estado === 'em_missao').length
      const formatarTempoEmpenhado = (segundos = 0) => {
        const total = Math.max(0, Number(segundos) || 0)
        const dias = Math.floor(total / 86400)
        const horas = Math.floor((total % 86400) / 3600)
        const minutos = Math.floor((total % 3600) / 60)
        const segs = total % 60
        if (dias > 0) return `${dias}d ${horas}h ${minutos}m`
        if (horas > 0) return `${horas}h ${minutos}m ${segs}s`
        if (minutos > 0) return `${minutos}m ${segs}s`
        return `${segs}s`
      }

      return (
        <>
          <strong style={styles.sectionTitle}>📊 Recursos Operacionais</strong>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:8, marginBottom:10 }}>
            {[
              ['Total', resumoRecursosOperacionais.length],
              ['🟢 Disponíveis', disponiveis],
              ['🔴 Em missão', emMissao]
            ].map(([nome,total]) => (
              <div key={nome} style={{ ...styles.itemCard, margin:0, textAlign:'center' }}>
                <div style={{ fontSize:22, fontWeight:800 }}>{total}</div>
                <div style={styles.itemSubtle}>{nome}</div>
              </div>
            ))}
          </div>
          {resumoRecursosOperacionais.length === 0 ? (
            <div style={styles.itemSubtle}>Sem recursos na operação ativa.</div>
          ) : resumoRecursosOperacionais.map(r => {
            const expandido = Number(recursoOperacionalExpandido) === Number(r.recurso_id)
            const periodosFechados = expandido ? (detalheRecursoOperacional?.ocorrencias_empenho || []) : []
            return (
              <div key={r.recurso_id} style={styles.itemCard}>
                <div
                  role="button"
                  tabIndex={0}
                  title="Ver detalhe do empenhamento"
                  style={{ cursor:'pointer' }}
                  onClick={() => alternarDetalheRecursoOperacional(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      alternarDetalheRecursoOperacional(r)
                    }
                  }}
                >
                  <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                    <div>
                      <div style={styles.itemTitle}>{r.indicativo_radio || r.nome}</div>
                      <div style={styles.itemSubtle}>{r.nome} · {r.tipo}</div>
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'flex-start', fontWeight:700 }}>
                      <span>{r.estado === 'disponivel' ? '🟢 Disponível' : r.estado === 'em_missao' ? '🔴 Em missão' : r.estado}</span>
                      <span>{expandido ? '⌃' : '›'}</span>
                    </div>
                  </div>
                  <div style={{ marginTop:8, display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:8 }}>
                    <div><div style={styles.itemMeta}>Ocorrência</div><div>{r.ocorrencia_atual || '—'}</div></div>
                    <div><div style={styles.itemMeta}>Missões</div><div>{r.total_missoes}</div></div>
                    <div>
                  <div style={styles.itemMeta}>Tempo total</div>
                  <div>{formatarTempoEmpenhado(r.tempo_total_empenhado_segundos)}</div>
                  {r.estado === 'em_missao' && r.empenho_atual_segundos > 0 && (
                    <div style={{ ...styles.itemSubtle, marginTop:3 }}>
                      Atual: {formatarTempoEmpenhado(r.empenho_atual_segundos)}
                    </div>
                  )}
                </div>
                  </div>
                </div>

                {expandido && (
                  <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid #e2e8f0' }}>
                    <div style={{ ...styles.itemMeta, marginBottom:6 }}>Detalhe do empenhamento</div>
                    {!detalheRecursoOperacional ? (
                      <div style={styles.itemSubtle}>A carregar...</div>
                    ) : (
                      <>
                        {r.estado === 'em_missao' && r.ocorrencia_id && (
                          <div style={{ ...styles.itemCard, margin:'6px 0' }}>
                            <div style={styles.itemTitle}>🔴 {r.ocorrencia_atual || `Ocorrência ${r.ocorrencia_id}`}</div>
                            <div style={styles.itemSubtle}>
                              Empenhamento atual · {formatarTempoEmpenhado(r.empenho_atual_segundos || 0)} · Em curso
                            </div>
                          </div>
                        )}
                        {periodosFechados.length === 0 && !(r.estado === 'em_missao' && r.ocorrencia_id) && (
                          <div style={styles.itemSubtle}>Sem períodos de empenhamento concluídos.</div>
                        )}
                        {periodosFechados.map((p, indice) => (
                          <div key={`${p.ocorrencia_id}-${p.libertado_em}-${indice}`} style={{ ...styles.itemCard, margin:'6px 0' }}>
                            <div style={styles.itemTitle}>✓ {p.ocorrencia_titulo || `Ocorrência ${p.ocorrencia_id}`}</div>
                            <div style={styles.itemSubtle}>
                              {formatarDataHora(p.mobilizado_em)} → {formatarDataHora(p.libertado_em)}
                            </div>
                            <div style={{ ...styles.itemMeta, marginTop:3 }}>
                              {formatarTempoEmpenhado(p.tempo_empenhado_segundos)}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )
    }

    if (abaAtiva === 'pao') {
      return (
        <>
          <strong style={styles.sectionTitle}>Plano de Ação Operacional</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {[
              ['resumo', '📊 Resumo'],
              ['intencao', '🧭 Intenção'],
              ['situacao', `🚦 Situação${totalObjetivosPAOEmAtencao > 0 ? ` ${totalObjetivosPAOEmAtencao}` : ''}`],
              ['decisoes', `📋 Decisões ${decisoesOperacionais.length}`]
            ].map(([id, nome]) => (
              <button
                key={id}
                style={{ ...styles.smallButton, fontWeight: secaoPAOAberta === id ? 700 : 500 }}
                onClick={() => setSecaoPAOAberta((atual) => atual === id ? null : id)}
              >
                {nome}
              </button>
            ))}
          </div>

          {secaoPAOAberta === 'resumo' && (
          <div style={styles.itemCard}>
            <div style={styles.itemTitle}>Resumo do PAO</div>
            <div style={{ ...styles.itemSubtle, marginBottom: 8 }}>Síntese automática do estado atual do Plano de Ação Operacional.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: 8 }}>
              {[
                ['🎯','Objetivos ativos',objetivos.filter(o => !o.arquivado && !['concluido','cancelado'].includes(o.estado)).length],
                ['🚩','Missões ativas',missoes.filter(m => !['concluida','cancelada'].includes(m.estado)).length],
                ['🔴','Missões críticas',missoes.filter(m => !['concluida','cancelada'].includes(m.estado) && m.situacao_operacional === 'critica').length],
                ['⚫','Necessitam reforço',missoes.filter(m => !['concluida','cancelada'].includes(m.estado) && m.situacao_operacional === 'necessita_reforco').length],
                ['📋','Decisões registadas',decisoesOperacionais.length]
              ].map(([icone,nome,total]) => (
                <div key={nome} style={{ ...styles.itemCard, margin: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: 22 }}>{icone}</div>
                  <div style={styles.itemTitle}>{total}</div>
                  <div style={styles.itemSubtle}>{nome}</div>
                </div>
              ))}
            </div>
          </div>
          )}

          {secaoPAOAberta === 'intencao' && (
          <div style={styles.itemCard}>
            <div style={styles.itemTitle}>Intenção do Comandante</div>
            <div style={{ ...styles.itemSubtle, marginBottom: 8 }}>
              Define a orientação geral da operação e serve de referência para os objetivos e missões.
            </div>
            <textarea
              style={{ ...styles.input, minHeight: 120, resize: 'vertical' }}
              value={intencaoComandante}
              disabled={modoBloqueado || aGuardarIntencao}
              placeholder="Registar a Intenção do Comandante..."
              onChange={(e) => {
                setIntencaoComandante(e.target.value)
                setMensagemIntencao('')
              }}
            />
            <div style={styles.buttonRow}>
              <button
                style={styles.smallButton}
                disabled={modoBloqueado || aGuardarIntencao || !operacaoAtiva?.id}
                onClick={guardarIntencaoComandante}
              >
                {aGuardarIntencao ? 'A guardar...' : 'Guardar'}
              </button>
            </div>
            {mensagemIntencao && (
              <div style={{ ...styles.itemSubtle, marginTop: 8 }}>{mensagemIntencao}</div>
            )}
          </div>
          )}

          {secaoPAOAberta === 'situacao' && (
          <div style={styles.itemCard}>
            <div style={styles.itemTitle}>Situação Operacional</div>
            <div style={{ ...styles.itemSubtle, marginBottom: 8 }}>
              Distribuição das missões ativas pela respetiva situação operacional.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: 8 }}>
              {[
                ['sob_controlo', '🟢', 'Sob controlo'],
                ['estavel', '🟡', 'Estável'],
                ['complexa', '🟠', 'Complexa'],
                ['critica', '🔴', 'Crítica'],
                ['necessita_reforco', '⚫', 'Necessita de reforço']
              ].map(([id, icone, nome]) => {
                const total = missoes.filter(
                  (m) => !['concluida', 'cancelada'].includes(m.estado) &&
                    (m.situacao_operacional || 'estavel') === id
                ).length
                return (
                  <div key={id} style={{ ...styles.itemCard, margin: 0, textAlign: 'center' }}>
                    <div style={{ fontSize: 22 }}>{icone}</div>
                    <div style={styles.itemTitle}>{total}</div>
                    <div style={styles.itemSubtle}>{nome}</div>
                  </div>
                )
              })}
            </div>

            {(() => {
              const missoesAtivas = missoes.filter(
                (m) => !['concluida', 'cancelada'].includes(m.estado)
              )
              const ocorrenciasEmAtencao = ocorrencias.map((ocorrencia) => {
                const objetivosAtencao = objetivos.filter((o) => !o.arquivado).map((objetivo) => {
                  const missoesObjetivo = missoesAtivas.filter((m) =>
                    Number(m.objetivo_id) === Number(objetivo.id) &&
                    Number(m.ocorrencia_id) === Number(ocorrencia.id)
                  )
                  const pertenceOcorrencia =
                    Number(objetivo.ocorrencia_id) === Number(ocorrencia.id) ||
                    missoesObjetivo.length > 0
                  if (!pertenceOcorrencia) return null

                  const necessitaReforco = missoesObjetivo.some(
                    (m) => m.situacao_operacional === 'necessita_reforco'
                  )
                  const critica = missoesObjetivo.some(
                    (m) => m.situacao_operacional === 'critica'
                  )
                  const situacao = necessitaReforco ? 'necessita_reforco' : critica ? 'critica' : null
                  return situacao ? { objetivo, situacao } : null
                }).filter(Boolean)

                return objetivosAtencao.length ? { ocorrencia, objetivosAtencao } : null
              }).filter(Boolean)

              return (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ ...styles.itemTitle, marginBottom: 6 }}>⚠️ Pontos que exigem atenção</div>
                  {ocorrenciasEmAtencao.length === 0 ? (
                    <div style={styles.itemSubtle}>
                      Não existem ocorrências com objetivos em situação crítica ou a necessitar de reforço.
                    </div>
                  ) : (
                    ocorrenciasEmAtencao.map(({ ocorrencia, objetivosAtencao }) => (
                      <div key={ocorrencia.id} style={{ ...styles.itemCard, marginTop: 6 }}>
                        <div style={styles.itemTitle}>🔴 {ocorrencia.titulo}</div>
                        {objetivosAtencao.map(({ objetivo, situacao }) => (
                          <div
                            key={objetivo.id}
                            role="button"
                            tabIndex={0}
                            title="Abrir este objetivo no PAO"
                            style={{ ...styles.itemSubtle, marginTop: 4, cursor: 'pointer' }}
                            onClick={() => {
                              const chaveGrupo = `ocorrencia-${ocorrencia.id}`
                              setSecaoPAOAberta(null)
                              setGruposPAOAbertos((atuais) => ({ ...atuais, [chaveGrupo]: true }))
                              setObjetivoPAOExpandido(objetivo.id)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                const chaveGrupo = `ocorrencia-${ocorrencia.id}`
                                setSecaoPAOAberta(null)
                                setGruposPAOAbertos((atuais) => ({ ...atuais, [chaveGrupo]: true }))
                                setObjetivoPAOExpandido(objetivo.id)
                              }
                            }}
                          >
                            {situacao === 'necessita_reforco' ? '⚫' : '🔴'} 🎯 {objetivo.nome}
                            {' · '}
                            {situacao === 'necessita_reforco' ? 'Necessita de reforço' : 'Crítica'}
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              )
            })()}
          </div>
          )}

          {secaoPAOAberta === 'decisoes' && (
          <div style={styles.itemCard}>
            <div style={styles.itemTitle}>Decisões Operacionais</div>
            <div style={{ ...styles.itemSubtle, marginBottom: 8 }}>
              Registo cronológico das decisões tomadas pelo Comandante durante a operação.
            </div>
            <textarea
              style={{ ...styles.input, minHeight: 80, resize: 'vertical' }}
              value={novaDecisaoOperacional}
              disabled={modoBloqueado || aGuardarDecisao}
              placeholder="Registar nova decisão operacional..."
              onChange={(e) => { setNovaDecisaoOperacional(e.target.value); setMensagemDecisao('') }}
            />
            <div style={styles.buttonRow}>
              <button style={styles.smallButton}
                disabled={modoBloqueado || aGuardarDecisao || !novaDecisaoOperacional.trim()}
                onClick={guardarDecisaoOperacional}>
                {aGuardarDecisao ? 'A guardar...' : '➕ Registar decisão'}
              </button>
            </div>
            {mensagemDecisao && <div style={{ ...styles.itemSubtle, marginTop: 8 }}>{mensagemDecisao}</div>}
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
              {decisoesOperacionais.length === 0 && <div style={styles.itemSubtle}>Ainda não existem decisões operacionais.</div>}
              {decisoesOperacionais.map(d => (
                <div key={d.id} style={{ ...styles.itemCard, marginTop: 6 }}>
                  <div style={styles.itemTitle}>{d.texto}</div>
                  <div style={styles.itemMeta}>
                    {d.autor || 'Comandante'} · {new Date(d.criado_em).toLocaleString('pt-PT', { timeZone: 'Atlantic/Azores', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}

          <div style={styles.itemCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={styles.itemTitle}>Objetivos operacionais</div>
              <button style={styles.smallButton} disabled={modoBloqueado} onClick={novoObjetivo}>
                ➕ Novo objetivo
              </button>
            </div>
            <div style={{ ...styles.itemSubtle, marginBottom: 8 }}>
              Objetivos definidos para concretizar a Intenção do Comandante.
            </div>
            {objetivos.filter((o) => !o.arquivado).length === 0 && (
              <div style={styles.itemSubtle}>Ainda não existem objetivos operacionais.</div>
            )}
            {(() => {
              const objetivosAtivos = objetivos.filter((o) => !o.arquivado)

              const gruposOcorrencia = ocorrencias
                .map((oc) => ({
                  ocorrencia: oc,
                  objetivos: objetivosAtivos.filter((o) =>
                    Number(o.ocorrencia_id) === Number(oc.id) ||
                    missoes.some((m) =>
                      Number(m.objetivo_id) === Number(o.id) &&
                      Number(m.ocorrencia_id) === Number(oc.id)
                    )
                  )
                }))
                .filter((grupo) => grupo.objetivos.length > 0)

              const objetivosSemOcorrencia = objetivosAtivos.filter((o) =>
                !o.ocorrencia_id ||
                missoes.some((m) =>
                  Number(m.objetivo_id) === Number(o.id) && !m.ocorrencia_id
                )
              )

              const renderObjetivoPAO = (o, ocorrenciaContexto = null) => {
                const missoesDoObjetivo = missoes.filter((m) => {
                  if (Number(m.objetivo_id) !== Number(o.id)) return false
                  if (ocorrenciaContexto) {
                    return Number(m.ocorrencia_id) === Number(ocorrenciaContexto.id)
                  }
                  return !m.ocorrencia_id
                })

                const pesosSituacaoObjetivo = {
                  necessita_reforco: 5,
                  critica: 4,
                  complexa: 3,
                  estavel: 2,
                  sob_controlo: 1
                }
                const situacaoObjetivo = missoesDoObjetivo
                  .filter((m) => !['concluida', 'cancelada'].includes(m.estado))
                  .reduce((maisGrave, m) => {
                    const atual = m.situacao_operacional || 'estavel'
                    return (pesosSituacaoObjetivo[atual] || 0) >
                      (pesosSituacaoObjetivo[maisGrave] || 0)
                      ? atual
                      : maisGrave
                  }, null)
                const iconeSituacaoObjetivo = {
                  necessita_reforco: '⚫',
                  critica: '🔴',
                  complexa: '🟠',
                  estavel: '🟡',
                  sob_controlo: '🟢'
                }[situacaoObjetivo] || '⚪'
                const totalMissoesAtivasObjetivo = missoesDoObjetivo.filter(
                  (m) => !['concluida', 'cancelada'].includes(m.estado)
                ).length
                const objetivoConcluidoComMissoesAtivas =
                  o.estado === 'concluido' && totalMissoesAtivasObjetivo > 0

                return (
                    <div key={o.id} style={{ ...styles.itemCard, marginTop: 8, borderLeft: `5px solid ${{ critica: '#dc2626', alta: '#ea580c', normal: '#2563eb', baixa: '#16a34a' }[o.prioridade] || '#64748b'}` }}>
                <div
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                  onClick={() => setObjetivoPAOExpandido((atual) => Number(atual) === Number(o.id) ? null : o.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setObjetivoPAOExpandido((atual) => Number(atual) === Number(o.id) ? null : o.id)
                    }
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={styles.itemTitle}>🎯 {o.nome}</div>
                    <div style={{ ...styles.itemMeta, display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{missoesDoObjetivo.length} {missoesDoObjetivo.length === 1 ? 'missão' : 'missões'}</span>
                      <span title="Situação mais grave entre as missões ativas">{iconeSituacaoObjetivo}</span>
                      {['critica', 'necessita_reforco'].includes(situacaoObjetivo) && (
                        <span
                          title={situacaoObjetivo === 'critica' ? 'Existe pelo menos uma missão crítica' : 'Existe pelo menos uma missão que necessita de reforço'}
                          style={{ fontWeight: 800, fontSize: 11 }}
                        >
                          ATENÇÃO
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700 }}>{Number(objetivoPAOExpandido) === Number(o.id) ? '⌃' : '›'}</div>
                </div>

                {Number(objetivoPAOExpandido) === Number(o.id) && (<>
                  <div style={{ ...styles.itemMeta, marginTop: 7, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <span>{o.prioridade}</span>
                    <span>{{
                      planeado: '📝 Planeado',
                      em_preparacao: '🛠️ Em preparação',
                      em_execucao: '▶️ Em execução',
                      suspenso: '⏸️ Suspenso',
                      concluido: '✅ Concluído',
                      cancelado: '⛔ Cancelado'
                    }[o.estado] || o.estado}</span>
                  </div>
                  {o.estado === 'planeado' && (
                    <div style={{ marginTop: 6 }}>
                      <button
                        style={styles.smallButton}
                        disabled={modoBloqueado}
                        onClick={() => alterarEstadoObjetivoPAO(o, 'em_execucao')}
                      >
                        ▶️ Iniciar objetivo
                      </button>
                    </div>
                  )}
                  {o.estado === 'em_execucao' && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        style={styles.smallButton}
                        disabled={modoBloqueado}
                        onClick={async () => {
                          if (!window.confirm(`Suspender o objetivo "${o.nome}"?\n\nAs missões associadas não serão alteradas.`)) return
                          await alterarEstadoObjetivoPAO(o, 'suspenso')
                        }}
                      >
                        ⏸️ Suspender objetivo
                      </button>
                      <button
                        style={styles.smallButton}
                        disabled={modoBloqueado}
                        onClick={async () => {
                          const missoesAtivas = missoesDoObjetivo.filter(
                            (m) => !['concluida', 'cancelada'].includes(m.estado)
                          )
                          const totalAtivas = missoesAtivas.length
                          const mensagem = totalAtivas > 0
                            ? `⚠️ Este objetivo ainda tem ${totalAtivas} ${totalAtivas === 1 ? 'missão ativa' : 'missões ativas'}.\n\nPretende mesmo concluir o objetivo "${o.nome}"?\n\nAs missões não serão alteradas automaticamente.`
                            : `Concluir o objetivo "${o.nome}"?`
                          if (!window.confirm(mensagem)) return
                          await alterarEstadoObjetivoPAO(o, 'concluido')
                        }}
                      >
                        ✅ Concluir objetivo
                      </button>
                    </div>
                  )}
                  {o.estado === 'suspenso' && (
                    <div style={{ marginTop: 6 }}>
                      <button style={styles.smallButton} disabled={modoBloqueado}
                        onClick={() => alterarEstadoObjetivoPAO(o, 'em_execucao')}>
                        ▶️ Retomar objetivo
                      </button>
                    </div>
                  )}
                  {!['concluido', 'cancelado'].includes(o.estado) && (
                    <div style={{ marginTop: 6 }}>
                      <button
                        style={styles.smallButton}
                        disabled={modoBloqueado}
                        onClick={async () => {
                          const totalAtivas = missoesDoObjetivo.filter(
                            (m) => !['concluida', 'cancelada'].includes(m.estado)
                          ).length
                          const mensagem = totalAtivas > 0
                            ? `⚠️ Este objetivo ainda tem ${totalAtivas} ${totalAtivas === 1 ? 'missão ativa' : 'missões ativas'}.\n\nPretende mesmo cancelar o objetivo "${o.nome}"?\n\nAs missões associadas NÃO serão canceladas nem alteradas automaticamente.`
                            : `Cancelar o objetivo "${o.nome}"?\n\nAs missões associadas não serão alteradas automaticamente.`
                          if (!window.confirm(mensagem)) return
                          await alterarEstadoObjetivoPAO(o, 'cancelado')
                        }}
                      >
                        ⛔ Cancelar objetivo
                      </button>
                    </div>
                  )}
                  {o.estado === 'cancelado' && (
                    <div style={{ marginTop: 6 }}>
                      <button
                        style={styles.smallButton}
                        disabled={modoBloqueado}
                        onClick={async () => {
                          if (!window.confirm(`Reabrir o objetivo "${o.nome}"?\n\nO objetivo voltará ao estado Em execução. As missões associadas não serão alteradas.`)) return
                          await alterarEstadoObjetivoPAO(o, 'em_execucao')
                        }}
                      >
                        ↩️ Reabrir objetivo
                      </button>
                    </div>
                  )}
                  {o.estado === 'concluido' && (
                    <div style={{ marginTop: 6 }}>
                      <button
                        style={styles.smallButton}
                        disabled={modoBloqueado}
                        onClick={async () => {
                          if (!window.confirm(`Reabrir o objetivo "${o.nome}"?\n\nO objetivo voltará ao estado Em execução. As missões associadas não serão alteradas.`)) return
                          await alterarEstadoObjetivoPAO(o, 'em_execucao')
                        }}
                      >
                        ↩️ Reabrir objetivo
                      </button>
                    </div>
                  )}
                  {objetivoConcluidoComMissoesAtivas && (
                    <div
                      title={`${totalMissoesAtivasObjetivo} ${totalMissoesAtivasObjetivo === 1 ? 'missão ativa' : 'missões ativas'} neste objetivo concluído`}
                      style={{ marginTop: 6, fontSize: 11, fontWeight: 700 }}
                    >
                      ⚠️ Objetivo concluído com missões ativas
                    </div>
                  )}
                  {o.responsavel && <div style={styles.itemSubtle}>Responsável: {o.responsavel}</div>}
                  {o.descricao && <div style={styles.itemSubtle}>{o.descricao}</div>}

                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ ...styles.itemMeta, marginBottom: 6 }}>Missões associadas</div>
                  {missoesDoObjetivo.length === 0 && (
                    <div style={styles.itemSubtle}>Sem missões associadas nesta ocorrência.</div>
                  )}
                  {missoesDoObjetivo.map((m) => {
                    const expandida = Number(missaoPAOExpandida) === Number(m.id)
                    const situacaoTexto = {
                      sob_controlo: '🟢 Sob controlo', estavel: '🟡 Estável',
                      complexa: '🟠 Complexa', critica: '🔴 Crítica',
                      necessita_reforco: '⚫ Necessita de reforço'
                    }[m.situacao_operacional] || '🟡 Estável'
                    const estadoTexto = {
                      recebida: '📥 Recebida', planeada: '📝 Planeada',
                      em_execucao: '▶️ Em execução', concluida: '✅ Concluída',
                      cancelada: '⛔ Cancelada'
                    }[m.estado] || m.estado
                    return (
                      <div key={m.id} style={{ ...styles.itemCard, marginTop: 6 }}>
                        <div role="button" tabIndex={0}
                          style={{ cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}
                          onClick={() => setMissaoPAOExpandida(a => Number(a) === Number(m.id) ? null : m.id)}
                          onKeyDown={(e) => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); setMissaoPAOExpandida(a => Number(a)===Number(m.id)?null:m.id) } }}>
                          <div style={{minWidth:0}}>
                            <div style={styles.itemTitle}>↳ {m.titulo}</div>
                            <div style={{ ...styles.itemMeta, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                              <span>{estadoTexto}</span><span>{situacaoTexto}</span>
                            </div>
                          </div>
                          <div style={{fontWeight:700}}>{expandida ? '⌃' : '›'}</div>
                        </div>
                        {m.estado === 'planeada' && !expandida && (
                          <div style={{marginTop:6}}>
                            <button style={styles.smallButton} disabled={modoBloqueado}
                              onClick={async(e)=>{e.stopPropagation();await alterarEstadoMissao(m.id,'em_execucao');await refresh()}}>
                              ▶️ Iniciar
                            </button>
                          </div>
                        )}
                        {expandida && (
                          <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid #e2e8f0'}}>
                            <div style={styles.itemMeta}>Prioridade: {{
                              baixa:'🟢 Baixa', media:'🔵 Média', alta:'🟠 Alta', critica:'🔴 Crítica'
                            }[m.prioridade] || '🔵 Média'}</div>
                            {m.responsavel && <div style={styles.itemSubtle}>Responsável: {m.responsavel}</div>}
                            {(() => {
                              const ids=(m.recurso_ids||[]).map(Number)
                              const rs=recursos.filter(r=>ids.includes(Number(r.id))||Number(r.missao_id)===Number(m.id))
                              return <div style={{marginTop:7}}>
                                <div style={{...styles.itemMeta,marginBottom:4}}>Recursos atribuídos</div>
                                {rs.length===0 ? <div style={styles.itemSubtle}>Sem recursos atribuídos.</div> :
                                  rs.map(r=><div key={r.id} style={styles.itemSubtle}>{obterIconeRecurso(r.tipo)} {r.indicativo_radio||r.nome} · {r.estado}</div>)}
                              </div>
                            })()}
                            <div style={{ ...styles.buttonRow, flexWrap: 'wrap' }}>
                              <button style={styles.smallButton} onClick={(e)=>{e.stopPropagation();setDetalhe({tipo:'missao',dados:m})}}>Abrir</button>
                              {m.estado==='planeada' && <button style={styles.smallButton} disabled={modoBloqueado}
                                onClick={async(e)=>{e.stopPropagation();await alterarEstadoMissao(m.id,'em_execucao');await refresh()}}>▶️ Iniciar</button>}
                              <button style={styles.smallButton} disabled={modoBloqueado||['concluida','cancelada'].includes(m.estado)}
                                onClick={async(e)=>{e.stopPropagation();const s=window.prompt('Situação: sob_controlo, estavel, complexa, critica ou necessita_reforco',m.situacao_operacional||'estavel');if(!s)return;const v=['sob_controlo','estavel','complexa','critica','necessita_reforco'];if(!v.includes(s)){window.alert('Situação inválida.');return}await alterarSituacaoMissao(m.id,s);await refresh()}}>Situação</button>
                              <button style={styles.smallButton} disabled={modoBloqueado||['concluida','cancelada'].includes(m.estado)}
                                onClick={async(e)=>{e.stopPropagation();if(!window.confirm(`Concluir a missão "${m.titulo}"?`))return;await concluirMissao(m.id);await refresh()}}>Concluir</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div style={styles.buttonRow}>
                  <button
                    style={styles.smallButton}
                    disabled={modoBloqueado}
                    onClick={() => {
                      setFormMissao({
                        titulo: '',
                        descricao: '',
                        prioridade: 'media',
                        estado: 'planeada',
                        responsavel: '',
                        notas: '',
                        situacao_operacional: 'estavel',
                        ocorrencia_id: ocorrenciaContexto?.id || null,
                        objetivo_id: o.id
                      })
                      setMostrarFormMissao(true)
                    }}
                  >
                    ➕ Nova missão
                  </button>
                  <button style={styles.smallButton} disabled={modoBloqueado} onClick={() => editarObjetivo(o)}>
                    Editar
                  </button>
                </div>
                </>)}
              </div>
                )
              }

              return (
                <>
                  {gruposOcorrencia.map(({ ocorrencia, objetivos: objetivosGrupo }) => {
                    const chaveGrupo = `ocorrencia-${ocorrencia.id}`
                    const grupoAberto = !!gruposPAOAbertos[chaveGrupo]
                    const missoesGrupo = missoes.filter((m) => Number(m.ocorrencia_id) === Number(ocorrencia.id) && objetivosGrupo.some((o) => Number(o.id) === Number(m.objetivo_id)))
                    const totalMissoesGrupo = missoesGrupo.length
                    const pesosSituacao = { necessita_reforco: 5, critica: 4, complexa: 3, estavel: 2, sob_controlo: 1 }
                    const situacaoMaisGrave = missoesGrupo.filter((m) => !['concluida', 'cancelada'].includes(m.estado)).reduce((a, m) => {
                      const atual = m.situacao_operacional || 'estavel'
                      return (pesosSituacao[atual] || 0) > (pesosSituacao[a] || 0) ? atual : a
                    }, null)
                    const iconeSituacao = { necessita_reforco: '⚫', critica: '🔴', complexa: '🟠', estavel: '🟡', sob_controlo: '🟢' }[situacaoMaisGrave] || '⚪'
                    const objetivosEmAtencao = objetivosGrupo.filter((objetivo) =>
                      missoesGrupo.some((m) =>
                        Number(m.objetivo_id) === Number(objetivo.id) &&
                        !['concluida', 'cancelada'].includes(m.estado) &&
                        ['critica', 'necessita_reforco'].includes(m.situacao_operacional)
                      )
                    ).length
                    return (
                      <div key={chaveGrupo} style={{ ...styles.itemCard, marginTop: 10, borderLeft: '5px solid #dc2626' }}>
                        <div role="button" tabIndex={0} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', minWidth: 0 }}
                          onClick={() => setGruposPAOAbertos((atuais) => ({ ...atuais, [chaveGrupo]: !grupoAberto }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGruposPAOAbertos((atuais) => ({ ...atuais, [chaveGrupo]: !grupoAberto })) } }}>
                          <div style={{ minWidth: 0, flex: '1 1 110px' }}>
                            <div style={{ ...styles.itemTitle, overflowWrap: 'anywhere' }}>{grupoAberto ? '▼' : '▶'} 🔴 {ocorrencia.titulo}</div>
                            <div style={{ ...styles.itemSubtle, overflowWrap: 'anywhere' }}>{ocorrencia.tipo} · {ocorrencia.estado}</div>
                          </div>
                          <div style={{ ...styles.itemMeta, flex: '1 1 120px', minWidth: 0, textAlign: 'right', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                            {iconeSituacao} · {totalMissoesGrupo} {totalMissoesGrupo === 1 ? 'missão' : 'missões'}
                            {objetivosEmAtencao > 0 && (
                              <> · {objetivosEmAtencao} {objetivosEmAtencao === 1 ? 'objetivo em atenção' : 'objetivos em atenção'}</>
                            )}
                          </div>
                        </div>
                        {grupoAberto && (<>
                          <div style={styles.buttonRow}>
                            <button style={styles.smallButton} onClick={() => { setDetalhe({ tipo: 'ocorrencia', dados: ocorrencia }); if (ocorrencia.latitude && ocorrencia.longitude && mapRef.current) mapRef.current.setView([ocorrencia.latitude, ocorrencia.longitude], 13) }}>Abrir ocorrência</button>
                            <button style={styles.smallButton} disabled={modoBloqueado} onClick={() => novoObjetivo(ocorrencia)}>➕ Novo objetivo</button>
                          </div>
                          <div style={{ marginTop: 8 }}>{objetivosGrupo.map((o) => renderObjetivoPAO(o, ocorrencia))}</div>
                        </>)}
                      </div>
                    )
                  })}

                  {objetivosSemOcorrencia.length > 0 && (() => {
                    const chaveGrupo = 'sem-ocorrencia'
                    const grupoAberto = !!gruposPAOAbertos[chaveGrupo]
                    const missoesGrupo = missoes.filter((m) => !m.ocorrencia_id && objetivosSemOcorrencia.some((o) => Number(o.id) === Number(m.objetivo_id)))
                    const totalMissoesGrupo = missoesGrupo.length
                    const pesosSituacao = { necessita_reforco: 5, critica: 4, complexa: 3, estavel: 2, sob_controlo: 1 }
                    const situacaoMaisGrave = missoesGrupo.filter((m) => !['concluida', 'cancelada'].includes(m.estado)).reduce((a, m) => {
                      const atual = m.situacao_operacional || 'estavel'
                      return (pesosSituacao[atual] || 0) > (pesosSituacao[a] || 0) ? atual : a
                    }, null)
                    const iconeSituacao = { necessita_reforco: '⚫', critica: '🔴', complexa: '🟠', estavel: '🟡', sob_controlo: '🟢' }[situacaoMaisGrave] || '⚪'
                    return (
                      <div style={{ ...styles.itemCard, marginTop: 10, borderLeft: '5px solid #94a3b8' }}>
                        <div role="button" tabIndex={0} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                          onClick={() => setGruposPAOAbertos((atuais) => ({ ...atuais, [chaveGrupo]: !grupoAberto }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGruposPAOAbertos((atuais) => ({ ...atuais, [chaveGrupo]: !grupoAberto })) } }}>
                          <div style={styles.itemTitle}>{grupoAberto ? '▼' : '▶'} ⚪ Sem ocorrência associada</div>
                          <div style={{ ...styles.itemMeta, whiteSpace: 'nowrap' }}>{iconeSituacao} · {totalMissoesGrupo} {totalMissoesGrupo === 1 ? 'missão' : 'missões'}</div>
                        </div>
                        {grupoAberto && <div style={{ marginTop: 8 }}>{objetivosSemOcorrencia.map((o) => renderObjetivoPAO(o, null))}</div>}
                      </div>
                    )
                  })()}
                </>
              )
            })()}
          </div>
        </>
      )
    }

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
          {['recursos', 'recursos_operacionais', 'ocorrencias', 'pao', 'setores', 'objetivos', 'missoes', 'ordens', 'timeline'].map((aba) => (
            <button
              key={aba}
              style={{
                ...styles.tabButton,
                ...(abaAtiva === aba ? styles.tabButtonActive : {}),
              }}
              onClick={() => setAbaAtiva(aba)}
            >
              {aba === 'recursos_operacionais' ? '📊 recursos' : aba}
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

          {(formMissao.ocorrencia_id || formMissao.objetivo_id) && (
            <div style={{ ...styles.itemCard, marginBottom: 10, background: '#f8fafc' }}>
              {formMissao.ocorrencia_id && (
                <div style={styles.itemSubtle}>
                  <strong>🔴 Ocorrência:</strong> {ocorrencias.find((o) => Number(o.id) === Number(formMissao.ocorrencia_id))?.titulo || `ID ${formMissao.ocorrencia_id}`}
                </div>
              )}
              {formMissao.objetivo_id && (
                <div style={{ ...styles.itemSubtle, marginTop: formMissao.ocorrencia_id ? 4 : 0 }}>
                  <strong>🎯 Objetivo:</strong> {objetivos.find((o) => Number(o.id) === Number(formMissao.objetivo_id))?.nome || `ID ${formMissao.objetivo_id}`}
                </div>
              )}
            </div>
          )}

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
            value={formMissao.estado || 'planeada'}
            onChange={(e) =>
              setFormMissao({ ...formMissao, estado: e.target.value })
            }
          >
            <option value="planeada">Estado inicial: Planeada</option>
            <option value="em_execucao">Estado inicial: Em execução</option>
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

              const novaMissao = await criarMissao({
                titulo: formMissao.titulo,
                descricao: formMissao.descricao,
                prioridade: formMissao.prioridade,
                estado: formMissao.estado || 'planeada',
                responsavel: formMissao.responsavel || null,
                notas: formMissao.notas || null,
                situacao_operacional: formMissao.situacao_operacional || 'estavel',
                recurso_id: null,
                ocorrencia_id: formMissao.ocorrencia_id
              })

              if (formMissao.objetivo_id && novaMissao?.id) {
                await associarObjetivoMissao(novaMissao.id, formMissao.objetivo_id)
              }

              await refresh()

              setMostrarFormMissao(false)

              setFormMissao({
                titulo: '',
                descricao: '',
                prioridade: 'media',
                responsavel: '',
                notas: '',
                situacao_operacional: 'estavel',
                ocorrencia_id: null,
                objetivo_id: null
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
          OPERAÇÃO CONCLUÍDA — MODO DE CONSULTA
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
    display: 'flex',
    flexDirection: 'column',
  },
  rightPanelContent: {
    padding: '12px',
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
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




