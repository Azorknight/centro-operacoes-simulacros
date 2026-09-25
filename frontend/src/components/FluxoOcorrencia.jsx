import { useEffect, useState } from 'react'
import { atribuirOcorrencia, atribuirElementoOcorrencia, confirmarChegada, confirmarChegadaElemento, comunicarSituacao, criarOrdem, alterarEstadoOrdem, obterChamadasOcorrencia, registarChamadaOcorrencia } from '../services/api'
import { formatarDataHora } from '../utils/formatacao'

const card = { border: '1px solid #dbe4f2', borderRadius: 9, padding: 10, marginTop: 10, background: '#f8fbff' }
const field = { width: '100%', boxSizing: 'border-box', padding: 8, marginTop: 7, border: '1px solid #cbd5e1', borderRadius: 6 }
const button = { padding: '8px 10px', marginTop: 8, border: 0, borderRadius: 6, color: '#fff', background: '#172033', cursor: 'pointer' }

export default function FluxoOcorrencia({ ocorrencia, recursos, elementos = [], ordens, eventos, bloqueado, atualizar }) {
  const [recursoDespacho, setRecursoDespacho] = useState('')
  const [recursoSituacao, setRecursoSituacao] = useState('')
  const [situacao, setSituacao] = useState('')
  const [recursoOrdem, setRecursoOrdem] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [chamadas, setChamadas] = useState([])
  const [chamada, setChamada] = useState({ informacao: '', origem: '', contacto: '', recebido_em: '' })
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const associados = recursos.filter(r => Number(r.ocorrencia_id) === Number(ocorrencia.id))
  const disponiveis = recursos.filter(r => !r.ocorrencia_id && ['disponivel', 'em_missao'].includes(r.estado))
  const ordensOcorrencia = ordens.filter(o => Number(o.ocorrencia_id) === Number(ocorrencia.id))
  const deslocacaoAtual = (tipo, id) => ordensOcorrencia.filter(o => Number(o[tipo]) === Number(id) && o.titulo.startsWith('Desloca')).reduce((ultima, o) => !ultima || new Date(o.criado_em) > new Date(ultima) ? o.criado_em : ultima, null)
  const chegou = r => eventos.some(e => e.tipo === 'chegada' && Number(e.recurso_id) === Number(r.id) && new Date(e.criado_em) >= new Date(deslocacaoAtual('recurso_id', r.id)))
  const noLocal = associados.filter(chegou)
  const elementosIndividuais = elementos.filter(e => !e.recurso_id && Number(e.ocorrencia_id) === Number(ocorrencia.id))
  const elementosDisponiveis = elementos.filter(e => !e.recurso_id && !e.ocorrencia_id && ['disponivel', 'apeado'].includes(e.estado))
  const chegouElemento = e => eventos.some(ev => ev.tipo === 'chegada' && Number(ev.elemento_id) === Number(e.id) && new Date(ev.criado_em) >= new Date(deslocacaoAtual('elemento_id', e.id)))
  const elementosNoLocal = elementosIndividuais.filter(chegouElemento)
  const alvo = valor => valor.startsWith('e:') ? { elemento_id: Number(valor.slice(2)) } : { recurso_id: Number(valor.slice(2)) }
  const nome = r => r.indicativo_radio || r.nome

  useEffect(() => {
    let ativo = true
    const atualizarChamadas = () => obterChamadasOcorrencia(ocorrencia.id).then(lista => { if (ativo) setChamadas(lista) }).catch(e => { if (ativo) setErro(e.message) })
    atualizarChamadas()
    const intervalo = window.setInterval(atualizarChamadas, 5000)
    return () => { ativo = false; window.clearInterval(intervalo) }
  }, [ocorrencia.id])

  async function guardar(acao) {
    setErro('')
    setOcupado(true)
    try {
      await acao()
      await atualizar()
    } catch (e) {
      setErro(e.message || 'Não foi possível guardar o registo.')
    } finally {
      setOcupado(false)
    }
  }

  const inativo = bloqueado || ocupado || ['encerrada', 'arquivada'].includes(ocorrencia.estado)

  return <div style={card}>
    <strong>Ordens e comunicações da ocorrência</strong>
    <p style={{ margin: '6px 0', color: '#475569', fontSize: 13 }}>Deslocação → chegada → informação do local → novas ordens.</p>
    {erro && <p role="alert" style={{ color: '#b91c1c' }}>{erro}</p>}

    <div style={card}>
      <strong>Chamadas recebidas ({chamadas.length})</strong>
      {chamadas.map(c => <div key={c.id} style={{ marginTop: 7 }}>
        <small>{formatarDataHora(c.recebido_em)}{c.origem ? ` · ${c.origem}` : ''}{c.contacto ? ` · ${c.contacto}` : ''}</small><br />{c.informacao}
      </div>)}
      <textarea aria-label="Informação recebida por telefone" style={{ ...field, minHeight: 55 }} placeholder="Nova informação recebida por telefone" value={chamada.informacao} onChange={e => setChamada({ ...chamada, informacao: e.target.value })} disabled={inativo} />
      <input aria-label="Origem da chamada" style={field} placeholder="Quem ligou (opcional)" value={chamada.origem} onChange={e => setChamada({ ...chamada, origem: e.target.value })} disabled={inativo} />
      <input aria-label="Contacto da chamada" style={field} placeholder="Contacto (opcional)" value={chamada.contacto} onChange={e => setChamada({ ...chamada, contacto: e.target.value })} disabled={inativo} />
      <label>Hora da chamada (em branco: agora)</label>
      <input aria-label="Hora da chamada" type="datetime-local" style={field} value={chamada.recebido_em} onChange={e => setChamada({ ...chamada, recebido_em: e.target.value })} disabled={inativo} />
      <button type="button" style={button} disabled={inativo || !chamada.informacao.trim()} onClick={() => guardar(async () => {
        await registarChamadaOcorrencia(ocorrencia.id, { ...chamada, informacao: chamada.informacao.trim(), recebido_em: chamada.recebido_em || null })
        setChamadas(await obterChamadasOcorrencia(ocorrencia.id))
        setChamada({ informacao: '', origem: '', contacto: '', recebido_em: '' })
      })}>Registar nova chamada</button>
    </div>

    <div style={card}>
      <strong>1. Ordenar deslocação</strong>
      <select aria-label="Recurso a deslocar" style={field} value={recursoDespacho} onChange={e => setRecursoDespacho(e.target.value)} disabled={inativo}>
        <option value="">Selecionar equipa ou elemento</option>
        {disponiveis.map(r => <option key={r.id} value={`r:${r.id}`}>Equipa {nome(r)}{r.estado === 'em_missao' ? ' · Em missão' : ' · Livre'}</option>)}
        {elementosDisponiveis.map(e => <option key={`e:${e.id}`} value={`e:${e.id}`}>Elemento {e.nome}</option>)}
      </select>
      <button type="button" style={button} disabled={inativo || !recursoDespacho} onClick={() => guardar(async () => {
        const destino = alvo(recursoDespacho)
        if (destino.elemento_id) await atribuirElementoOcorrencia(destino.elemento_id, ocorrencia.id)
        else await atribuirOcorrencia(destino.recurso_id, ocorrencia.id)
        setRecursoDespacho('')
      })}>Emitir ordem de deslocação</button>
    </div>

    <div style={card}>
      <strong>2. Confirmar chegada</strong>
      {associados.length === 0 && elementosIndividuais.length === 0 && <p>Ainda não há equipas ou elementos associados.</p>}
      {associados.map(r => <div key={r.id} style={{ marginTop: 6 }}>
        {nome(r)} — {chegou(r) ? 'Chegada registada' : 'Em deslocação'}
        {!chegou(r) && <button type="button" style={{ ...button, marginLeft: 8 }} disabled={inativo} onClick={() => guardar(() => confirmarChegada(r.id))}>Confirmar chegada</button>}
      </div>)}
      {elementosIndividuais.map(e => <div key={`e:${e.id}`} style={{ marginTop: 6 }}>
        {e.nome} — {chegouElemento(e) ? 'Chegada registada' : 'Em deslocação'}
        {!chegouElemento(e) && <button type="button" style={{ ...button, marginLeft: 8 }} disabled={inativo} onClick={() => guardar(() => confirmarChegadaElemento(e.id))}>Confirmar chegada</button>}
      </div>)}
    </div>

    <div style={card}>
      <strong>3. Informação do recurso no local</strong>
      <select aria-label="Recurso que informa" style={field} value={recursoSituacao} onChange={e => setRecursoSituacao(e.target.value)} disabled={inativo}>
        <option value="">Selecionar equipa ou elemento chegado</option>
        {noLocal.map(r => <option key={r.id} value={`r:${r.id}`}>{nome(r)}</option>)}
        {elementosNoLocal.map(e => <option key={`e:${e.id}`} value={`e:${e.id}`}>{e.nome}</option>)}
      </select>
      <textarea aria-label="Situação comunicada" style={{ ...field, minHeight: 65 }} placeholder="O que encontrou no local? Riscos, vítimas, necessidades..." value={situacao} onChange={e => setSituacao(e.target.value)} disabled={inativo} />
      <button type="button" style={button} disabled={inativo || !recursoSituacao || !situacao.trim()} onClick={() => guardar(async () => {
        await comunicarSituacao(ocorrencia.id, alvo(recursoSituacao), situacao.trim())
        setSituacao('')
      })}>Registar informação recebida</button>
    </div>

    <div style={card}>
      <strong>4. Dar nova ordem</strong>
      <select aria-label="Destinatário da ordem" style={field} value={recursoOrdem} onChange={e => setRecursoOrdem(e.target.value)} disabled={inativo}>
        <option value="">Selecionar equipa ou elemento chegado</option>
        {noLocal.map(r => <option key={r.id} value={`r:${r.id}`}>{nome(r)}</option>)}
        {elementosNoLocal.map(e => <option key={`e:${e.id}`} value={`e:${e.id}`}>{e.nome}</option>)}
      </select>
      <input aria-label="Ação ordenada" style={field} placeholder="Ação ordenada" value={titulo} onChange={e => setTitulo(e.target.value)} disabled={inativo} />
      <textarea aria-label="Instruções da ordem" style={{ ...field, minHeight: 55 }} placeholder="Instruções ou condições (opcional)" value={descricao} onChange={e => setDescricao(e.target.value)} disabled={inativo} />
      <button type="button" style={button} disabled={inativo || !recursoOrdem || !titulo.trim()} onClick={() => guardar(async () => {
        await criarOrdem({ titulo: titulo.trim(), descricao: descricao.trim(), ...alvo(recursoOrdem), ocorrencia_id: ocorrencia.id })
        setTitulo('')
        setDescricao('')
      })}>Emitir ordem</button>
    </div>

    <div style={card}>
      <strong>Ordens emitidas ({ordensOcorrencia.length})</strong>
      {ordensOcorrencia.length === 0 && <p>Sem ordens registadas.</p>}
      {ordensOcorrencia.map(o => {
        const recurso = recursos.find(r => Number(r.id) === Number(o.recurso_id))
        const elemento = elementos.find(e => Number(e.id) === Number(o.elemento_id))
        return <div key={o.id} style={{ borderTop: '1px solid #dbe4f2', marginTop: 7, paddingTop: 7 }}>
          <b>{o.titulo}</b> · {o.elemento_id ? (elemento?.nome || `Elemento ${o.elemento_id}`) : (recurso ? nome(recurso) : `Recurso ${o.recurso_id}`)}<br />
          {o.descricao && <span>{o.descricao}<br /></span>}
          <small>{o.estado} · {formatarDataHora(o.criado_em)}</small>
          {!inativo && o.estado === 'emitida' && !o.titulo.startsWith('Desloca') && <button type="button" style={{ ...button, marginLeft: 5 }} onClick={() => guardar(() => alterarEstadoOrdem(o.id, 'executada'))}>Executada</button>}
          {!inativo && o.estado === 'executada' && <button type="button" style={{ ...button, marginLeft: 5 }} onClick={() => guardar(() => alterarEstadoOrdem(o.id, 'concluida'))}>Concluir</button>}
        </div>
      })}
    </div>

    <div style={card}>
      <strong>Registo cronológico</strong>
      {eventos.length === 0 && <p>Sem registos.</p>}
      {eventos.map(e => <div key={e.id} style={{ borderTop: '1px solid #dbe4f2', marginTop: 7, paddingTop: 7 }}>
        <small>{formatarDataHora(e.criado_em)} · {e.tipo}</small><br />{e.descricao}
      </div>)}
    </div>
  </div>
}
