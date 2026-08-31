import { useEffect, useMemo, useState } from 'react'
import {
  adicionarElementoParticipante,
  adicionarRecursoParticipante,
  criarElementoCatalogo,
  criarRecursoCatalogo,
  obterCatalogoElementos,
  obterCatalogoRecursos,
  obterElementosParticipantes,
  obterRecursosParticipantes,
  retirarElementoParticipante,
  retirarRecursoParticipante
} from '../services/api'

const novoRecursoInicial = { nome: '', tipo: '', ilha: '', entidade_id: null, estado: 'ativo' }
const novoElementoInicial = { nome: '', entidade: '', estado: 'ativo' }

function PrepararOperacao({ operacao, onFechar }) {
  const [separador, setSeparador] = useState('recursos')
  const [catalogoRecursos, setCatalogoRecursos] = useState([])
  const [recursos, setRecursos] = useState([])
  const [catalogoElementos, setCatalogoElementos] = useState([])
  const [elementos, setElementos] = useState([])
  const [selecionado, setSelecionado] = useState('')
  const [indicativo, setIndicativo] = useState('')
  const [funcao, setFuncao] = useState('')
  const [recursoSelecionado, setRecursoSelecionado] = useState('')
  const [mostrarNovo, setMostrarNovo] = useState(false)
  const [novoRecurso, setNovoRecurso] = useState(novoRecursoInicial)
  const [novoElemento, setNovoElemento] = useState(novoElementoInicial)
  const [erro, setErro] = useState('')
  const [aCarregar, setACarregar] = useState(true)
  const [aGuardar, setAGuardar] = useState(false)

  async function carregar() {
    try {
      setErro('')
      const [catR, partR, catE, partE] = await Promise.all([
        obterCatalogoRecursos(),
        obterRecursosParticipantes(operacao.id),
        obterCatalogoElementos(),
        obterElementosParticipantes(operacao.id)
      ])
      setCatalogoRecursos(catR)
      setRecursos(partR)
      setCatalogoElementos(catE)
      setElementos(partE)
    } catch {
      setErro('Não foi possível carregar a preparação da operação.')
    } finally {
      setACarregar(false)
    }
  }

  useEffect(() => { carregar() }, [operacao.id])

  useEffect(() => {
    setSelecionado('')
    setIndicativo('')
    setFuncao('')
    setRecursoSelecionado('')
    setMostrarNovo(false)
  }, [separador])

  const idsRecursos = useMemo(() => new Set(recursos.map((i) => i.recurso_catalogo_id)), [recursos])
  const idsElementos = useMemo(() => new Set(elementos.map((i) => i.elemento_catalogo_id)), [elementos])
  const disponiveis = separador === 'recursos'
    ? catalogoRecursos.filter((i) => !idsRecursos.has(i.id))
    : catalogoElementos.filter((i) => !idsElementos.has(i.id))
  const participantes = separador === 'recursos' ? recursos : elementos

  async function adicionar(evento) {
    evento.preventDefault()
    if (!selecionado) return
    try {
      setAGuardar(true)
      setErro('')
      if (separador === 'recursos') {
        await adicionarRecursoParticipante(operacao.id, {
          recurso_catalogo_id: Number(selecionado),
          indicativo_operacional: indicativo.trim() || null,
          funcao: funcao.trim() || null
        })
      } else {
        await adicionarElementoParticipante(operacao.id, {
          elemento_catalogo_id: Number(selecionado),
          indicativo_operacional: indicativo.trim() || null,
          funcao_operacional: funcao.trim() || null,
          recurso_catalogo_id: recursoSelecionado ? Number(recursoSelecionado) : null
        })
      }
      setSelecionado(''); setIndicativo(''); setFuncao(''); setRecursoSelecionado('')
      await carregar()
    } catch {
      setErro(`Não foi possível adicionar o ${separador === 'recursos' ? 'recurso' : 'elemento'} à operação.`)
    } finally { setAGuardar(false) }
  }

  async function retirar(item) {
    const nome = item.nome
    if (!window.confirm(`Retirar "${nome}" desta operação?`)) return
    try {
      setErro('')
      if (separador === 'recursos') {
        await retirarRecursoParticipante(operacao.id, item.recurso_catalogo_id)
      } else {
        await retirarElementoParticipante(operacao.id, item.elemento_catalogo_id)
      }
      await carregar()
    } catch {
      setErro(`Não foi possível retirar o ${separador === 'recursos' ? 'recurso' : 'elemento'}.`)
    }
  }

  async function guardarNovo(evento) {
    evento.preventDefault()
    try {
      setAGuardar(true); setErro('')
      if (separador === 'recursos') {
        if (!novoRecurso.nome.trim() || !novoRecurso.tipo.trim()) return
        const criado = await criarRecursoCatalogo({ ...novoRecurso, ilha: novoRecurso.ilha.trim() || null })
        setNovoRecurso(novoRecursoInicial)
        await carregar()
        setSelecionado(String(criado.id))
      } else {
        if (!novoElemento.nome.trim()) return
        const criado = await criarElementoCatalogo({
          ...novoElemento,
          entidade: novoElemento.entidade.trim() || null
        })
        setNovoElemento(novoElementoInicial)
        await carregar()
        setSelecionado(String(criado.id))
      }
      setMostrarNovo(false)
    } catch {
      setErro(`Não foi possível guardar o ${separador === 'recursos' ? 'recurso' : 'elemento'} permanente.`)
    } finally { setAGuardar(false) }
  }

  return (
    <div className="modal-fundo" onMouseDown={onFechar}>
      <section className="modal-operacao modal-preparacao" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-topo">
          <div><h2>Preparar operação</h2><p className="preparacao-subtitulo">{operacao.nome}</p></div>
          <button type="button" className="botao-fechar" onClick={onFechar}>×</button>
        </div>

        <div className="preparacao-tabs">
          <button className={separador === 'recursos' ? 'ativo' : ''} onClick={() => setSeparador('recursos')}>
            Recursos ({recursos.length})
          </button>
          <button className={separador === 'elementos' ? 'ativo' : ''} onClick={() => setSeparador('elementos')}>
            Elementos ({elementos.length})
          </button>
        </div>

        {erro && <div className="operacoes-erro erro-no-modal">{erro}</div>}

        <div className="preparacao-resumo">
          <strong>{participantes.length}</strong>
          <span>{separador === 'recursos' ? 'recursos participantes' : 'elementos participantes'}</span>
        </div>

        <form className="adicionar-participante" onSubmit={adicionar}>
          <div className="campo-recurso">
            <label>{separador === 'recursos' ? 'Recurso permanente' : 'Elemento permanente'}</label>
            <select value={selecionado} onChange={(e) => setSelecionado(e.target.value)} required>
              <option value="">Selecionar...</option>
              {disponiveis.map((item) => (
                <option value={item.id} key={item.id}>
                  {separador === 'recursos'
                    ? `${item.nome} — ${item.tipo}${item.ilha ? ` — ${item.ilha}` : ''}`
                    : `${item.nome}${item.entidade ? ` — ${item.entidade}` : ''}`}
                </option>
              ))}
            </select>
          </div>
          <div><label>Indicativo nesta operação</label><input value={indicativo} onChange={(e) => setIndicativo(e.target.value)} placeholder="Ex.: Alfa 01" /></div>
          <div><label>Função operacional</label><input value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder={separador === 'recursos' ? 'Ex.: Patrulhamento' : 'Ex.: Chefe de equipa'} /></div>
          {separador === 'elementos' && (
            <div>
              <label>Viatura / recurso de transporte</label>
              <select value={recursoSelecionado} onChange={(e) => setRecursoSelecionado(e.target.value)}>
                <option value="">Sem viatura atribuída</option>
                {recursos.map((recurso) => (
                  <option key={recurso.recurso_catalogo_id} value={recurso.recurso_catalogo_id}>
                    {recurso.indicativo_operacional ? `${recurso.indicativo_operacional} — ` : ''}{recurso.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="botao-primario" disabled={aGuardar || !selecionado}>Adicionar</button>
        </form>

        <button type="button" className="botao-link-recurso" onClick={() => setMostrarNovo((v) => !v)}>
          {mostrarNovo ? 'Cancelar novo registo' : `+ Registar novo ${separador === 'recursos' ? 'recurso' : 'elemento'} permanente`}
        </button>

        {mostrarNovo && (
          <form className="novo-recurso-caixa" onSubmit={guardarNovo}>
            <h3>Novo {separador === 'recursos' ? 'recurso' : 'elemento'} permanente</h3>
            {separador === 'recursos' ? (
              <>
                <div className="campos-duplos">
                  <div><label>Nome *</label><input value={novoRecurso.nome} onChange={(e) => setNovoRecurso({ ...novoRecurso, nome: e.target.value })} required /></div>
                  <div><label>Tipo *</label><input value={novoRecurso.tipo} onChange={(e) => setNovoRecurso({ ...novoRecurso, tipo: e.target.value })} required /></div>
                </div>
                <label>Ilha</label><input value={novoRecurso.ilha} onChange={(e) => setNovoRecurso({ ...novoRecurso, ilha: e.target.value })} />
              </>
            ) : (
              <div className="campos-duplos">
                <div><label>Nome *</label><input value={novoElemento.nome} onChange={(e) => setNovoElemento({ ...novoElemento, nome: e.target.value })} required /></div>
                <div><label>Entidade</label><input value={novoElemento.entidade} onChange={(e) => setNovoElemento({ ...novoElemento, entidade: e.target.value })} placeholder="Ex.: PSP" /></div>
              </div>
            )}
            <div className="modal-acoes"><button type="submit" className="botao-primario" disabled={aGuardar}>Guardar</button></div>
          </form>
        )}

        <div className="participantes-titulo">
          <h3>{separador === 'recursos' ? 'Recursos selecionados' : 'Elementos selecionados'}</h3>
          <span>O indicativo e a função são válidos apenas nesta operação.</span>
        </div>

        {aCarregar ? <div className="preparacao-vazio">A carregar...</div> : participantes.length === 0 ? (
          <div className="preparacao-vazio">Ainda não foram selecionados {separador}.</div>
        ) : (
          <div className="participantes-lista">
            {participantes.map((item) => (
              <article className="participante-item" key={item.participacao_id}>
                <div>
                  <strong>{item.nome}</strong>
                  <p>{separador === 'recursos' ? `${item.tipo}${item.ilha ? ` · ${item.ilha}` : ''}` : (item.entidade || 'Entidade não definida')}</p>
                  <small>
                    Indicativo: <b>{item.indicativo_operacional || 'não definido'}</b>
                    {(item.funcao || item.funcao_operacional) ? ` · Função: ${item.funcao || item.funcao_operacional}` : ''}
                    {separador === 'elementos'
                      ? ` · Viatura: ${item.recurso_nome ? `${item.recurso_indicativo ? `${item.recurso_indicativo} — ` : ''}${item.recurso_nome}` : 'não atribuída'}`
                      : ''}
                  </small>
                </div>
                <button type="button" className="botao-retirar" onClick={() => retirar(item)}>Retirar</button>
              </article>
            ))}
          </div>
        )}

        <div className="modal-acoes preparacao-rodape"><button type="button" className="botao-abrir" onClick={onFechar}>Concluir preparação</button></div>
      </section>
    </div>
  )
}

export default PrepararOperacao
