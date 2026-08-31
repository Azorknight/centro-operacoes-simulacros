import { useEffect, useState } from 'react'
import {
  arquivarOperacao,
  ativarOperacao,
  criarOperacao,
  eliminarOperacao,
  obterOperacoes,
  obterOperacoesArquivadas,
  restaurarOperacao
} from '../services/api'
import PrepararOperacao from './PrepararOperacao'
import './Operacoes.css'

const formularioInicial = {
  nome: '',
  tipo: 'simulacro',
  entidade_organizadora: '',
  local: '',
  objetivo: '',
  descricao: '',
  data_inicio: ''
}

function Operacoes({ onAbrir }) {
  const [operacoes, setOperacoes] = useState([])
  const [arquivadas, setArquivadas] = useState([])
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [formulario, setFormulario] = useState(formularioInicial)
  const [aCarregar, setACarregar] = useState(true)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState('')
  const [operacaoAEliminar, setOperacaoAEliminar] = useState(null)
  const [confirmacaoEliminacao, setConfirmacaoEliminacao] = useState('')
  const [aEliminar, setAEliminar] = useState(false)
  const [operacaoAPreparar, setOperacaoAPreparar] = useState(null)

  async function carregarOperacoes() {
    try {
      setErro('')
      const [ativas, listaArquivadas] = await Promise.all([
        obterOperacoes(),
        obterOperacoesArquivadas()
      ])
      setOperacoes(ativas)
      setArquivadas(listaArquivadas)
    } catch (e) {
      setErro('Não foi possível ligar à API. Confirme se o backend está iniciado.')
    } finally {
      setACarregar(false)
    }
  }

  useEffect(() => {
    carregarOperacoes()
  }, [])

  function alterarCampo(evento) {
    const { name, value } = evento.target
    setFormulario((anterior) => ({ ...anterior, [name]: value }))
  }

  async function guardarOperacao(evento) {
    evento.preventDefault()
    if (!formulario.nome.trim()) return

    try {
      setAGuardar(true)
      setErro('')
      const criada = await criarOperacao({
        ...formulario,
        entidade_organizadora: formulario.entidade_organizadora || null,
        local: formulario.local || null,
        objetivo: formulario.objetivo || null,
        descricao: formulario.descricao || null,
        data_inicio: formulario.data_inicio || null,
        data_fim: null
      })
      setFormulario(formularioInicial)
      setMostrarFormulario(false)
      await carregarOperacoes()
      await abrirOperacao(criada)
    } catch (e) {
      setErro('Não foi possível criar a operação.')
    } finally {
      setAGuardar(false)
    }
  }

  async function arquivar(operacao) {
    const confirmado = window.confirm(
      `Arquivar a operação "${operacao.nome}"?\n\nOs dados não serão apagados.`
    )

    if (!confirmado) return

    try {
      setErro('')
      await arquivarOperacao(operacao.id)
      await carregarOperacoes()
    } catch (e) {
      setErro('Não foi possível arquivar a operação. Confirme que não está ativa.')
    }
  }

  async function restaurar(operacao) {
    try {
      setErro('')
      await restaurarOperacao(operacao.id)
      await carregarOperacoes()
    } catch (e) {
      setErro('Não foi possível restaurar a operação.')
    }
  }

  function pedirEliminacao(operacao) {
    setConfirmacaoEliminacao('')
    setOperacaoAEliminar(operacao)
  }

  async function confirmarEliminacao(evento) {
    evento.preventDefault()
    if (!operacaoAEliminar || confirmacaoEliminacao.trim().toUpperCase() !== 'ELIMINAR') return

    try {
      setAEliminar(true)
      setErro('')
      await eliminarOperacao(operacaoAEliminar.id, confirmacaoEliminacao)
      setOperacaoAEliminar(null)
      setConfirmacaoEliminacao('')
      await carregarOperacoes()
    } catch (e) {
      setErro('Não foi possível eliminar a operação. Confirme que está arquivada e escreva ELIMINAR.')
    } finally {
      setAEliminar(false)
    }
  }

  async function abrirOperacao(operacao) {
    try {
      setErro('')
      await ativarOperacao(operacao.id)
      onAbrir(operacao)
    } catch (e) {
      setErro('Não foi possível abrir a operação.')
    }
  }

  return (
    <div className="operacoes-page">
      <main className="operacoes-card">
        <header className="operacoes-header">
          <div className="operacoes-logo">SGO</div>
          <div>
            <h1>Sistema de Gestão Operacional</h1>
            <p>Gestão de exercícios e simulacros</p>
          </div>
        </header>

        {erro && <div className="operacoes-erro">{erro}</div>}

        <section className="operacoes-toolbar">
          <div>
            <h2>Operações</h2>
            <p>Crie uma nova operação ou abra uma já existente.</p>
          </div>
          <div className="toolbar-acoes">
            <button
              className="botao-secundario"
              onClick={() => setMostrarArquivadas((valor) => !valor)}
            >
              {mostrarArquivadas ? 'Ocultar arquivo' : `Arquivo (${arquivadas.length})`}
            </button>
            <button className="botao-primario" onClick={() => setMostrarFormulario(true)}>
              + Nova operação
            </button>
          </div>
        </section>

        {aCarregar ? (
          <div className="operacoes-vazio">A carregar operações...</div>
        ) : operacoes.length === 0 ? (
          <div className="operacoes-vazio">
            <strong>Ainda não existem operações ativas.</strong>
            <span>Crie uma nova operação ou restaure uma do arquivo.</span>
          </div>
        ) : (
          <div className="operacoes-lista">
            {operacoes.map((operacao) => (
              <article className="operacao-item" key={operacao.id}>
                <div className="operacao-info">
                  <div className="operacao-titulo-linha">
                    <h3>{operacao.nome}</h3>
                    <span>{operacao.tipo}</span>
                  </div>
                  <p>{operacao.local || 'Local não definido'}</p>
                  <small>Estado: {operacao.estado}</small>
                </div>
                <div className="operacao-acoes">
                  <button className="botao-preparar" onClick={() => setOperacaoAPreparar(operacao)}>
                    Preparar
                  </button>
                  <button className="botao-arquivar" onClick={() => arquivar(operacao)}>
                    Arquivar
                  </button>
                  <button className="botao-abrir" onClick={() => abrirOperacao(operacao)}>
                    Abrir operação
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {mostrarArquivadas && (
          <section className="arquivo-seccao">
            <div className="arquivo-cabecalho">
              <div>
                <h2>Operações arquivadas</h2>
                <p>Os dados permanecem guardados e podem ser restaurados.</p>
              </div>
            </div>

            {arquivadas.length === 0 ? (
              <div className="arquivo-vazio">Não existem operações arquivadas.</div>
            ) : (
              <div className="operacoes-lista arquivo-lista">
                {arquivadas.map((operacao) => (
                  <article className="operacao-item operacao-arquivada" key={operacao.id}>
                    <div className="operacao-info">
                      <div className="operacao-titulo-linha">
                        <h3>{operacao.nome}</h3>
                        <span>{operacao.tipo}</span>
                      </div>
                      <p>{operacao.local || 'Local não definido'}</p>
                      <small>Estado: arquivada</small>
                    </div>
                    <div className="operacao-acoes">
                      <button className="botao-eliminar" onClick={() => pedirEliminacao(operacao)}>
                        Eliminar definitivamente
                      </button>
                      <button className="botao-restaurar" onClick={() => restaurar(operacao)}>
                        Restaurar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {operacaoAPreparar && (
        <PrepararOperacao
          operacao={operacaoAPreparar}
          onFechar={() => setOperacaoAPreparar(null)}
        />
      )}

      {operacaoAEliminar && (
        <div className="modal-fundo" onMouseDown={() => !aEliminar && setOperacaoAEliminar(null)}>
          <form className="modal-operacao modal-eliminar" onSubmit={confirmarEliminacao} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-topo">
              <h2>Eliminar operação definitivamente</h2>
              <button type="button" className="botao-fechar" disabled={aEliminar} onClick={() => setOperacaoAEliminar(null)}>×</button>
            </div>

            <div className="aviso-eliminacao">
              <strong>Esta ação não pode ser anulada.</strong>
              <p>Serão apagados todos os dados associados à operação:</p>
              <p className="nome-operacao-eliminar">{operacaoAEliminar.nome}</p>
              <p>Inclui ocorrências, recursos, elementos, missões, ordens e timeline.</p>
            </div>

            <label>Para confirmar, escreva ELIMINAR</label>
            <input
              value={confirmacaoEliminacao}
              onChange={(e) => setConfirmacaoEliminacao(e.target.value)}
              placeholder="ELIMINAR"
              autoFocus
              autoComplete="off"
            />

            <div className="modal-acoes">
              <button type="button" className="botao-secundario" disabled={aEliminar} onClick={() => setOperacaoAEliminar(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="botao-confirmar-eliminacao"
                disabled={aEliminar || confirmacaoEliminacao.trim().toUpperCase() !== 'ELIMINAR'}
              >
                {aEliminar ? 'A eliminar...' : 'Eliminar definitivamente'}
              </button>
            </div>
          </form>
        </div>
      )}

      {mostrarFormulario && (
        <div className="modal-fundo" onMouseDown={() => setMostrarFormulario(false)}>
          <form className="modal-operacao" onSubmit={guardarOperacao} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-topo">
              <h2>Nova operação</h2>
              <button type="button" className="botao-fechar" onClick={() => setMostrarFormulario(false)}>×</button>
            </div>

            <label>Nome da operação *</label>
            <input name="nome" value={formulario.nome} onChange={alterarCampo} required autoFocus />

            <div className="campos-duplos">
              <div>
                <label>Tipo</label>
                <select name="tipo" value={formulario.tipo} onChange={alterarCampo}>
                  <option value="simulacro">Simulacro</option>
                  <option value="exercicio">Exercício</option>
                  <option value="real">Operação real</option>
                  <option value="formacao">Formação</option>
                  <option value="demonstracao">Demonstração</option>
                  <option value="teste">Teste</option>
                </select>
              </div>
              <div>
                <label>Data e hora de início</label>
                <input type="datetime-local" name="data_inicio" value={formulario.data_inicio} onChange={alterarCampo} />
              </div>
            </div>

            <label>Entidade organizadora</label>
            <input name="entidade_organizadora" value={formulario.entidade_organizadora} onChange={alterarCampo} />

            <label>Local</label>
            <input name="local" value={formulario.local} onChange={alterarCampo} />

            <label>Objetivo</label>
            <input name="objetivo" value={formulario.objetivo} onChange={alterarCampo} />

            <label>Descrição</label>
            <textarea name="descricao" rows="3" value={formulario.descricao} onChange={alterarCampo} />

            <div className="modal-acoes">
              <button type="button" className="botao-secundario" onClick={() => setMostrarFormulario(false)}>Cancelar</button>
              <button type="submit" className="botao-primario" disabled={aGuardar}>
                {aGuardar ? 'A guardar...' : 'Criar e abrir'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default Operacoes
