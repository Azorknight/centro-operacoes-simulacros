import { useEffect, useRef, useState } from 'react'
import { criarBaseOperacao, obterBasesOperacao } from '../services/api'

const inicial = {
  nome: '', tipo: '', entidade: '', ilha: '', latitude: '', longitude: ''
}

export default function BasesOperacao({ operacaoId }) {
  const [bases, setBases] = useState([])
  const [dados, setDados] = useState(inicial)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [carregado, setCarregado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const bloqueio = useRef(false)

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    setCarregado(false)
    setErro('')
    setBases([])
    setDados(inicial)
    obterBasesOperacao(operacaoId)
      .then((lista) => {
        if (ativo) {
          setBases(lista)
          setCarregado(true)
        }
      })
      .catch((e) => { if (ativo) setErro(e.message) })
      .finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
  }, [operacaoId])

  async function guardar(evento) {
    evento.preventDefault()
    if (bloqueio.current || !carregado) return
    if (!dados.nome.trim() || !dados.ilha.trim()) {
      setErro('Nome e ilha s\u00e3o obrigat\u00f3rios.')
      return
    }
    bloqueio.current = true
    setGuardando(true)
    setErro('')
    try {
      const criada = await criarBaseOperacao(operacaoId, {
        nome: dados.nome.trim(),
        ilha: dados.ilha.trim(),
        tipo: dados.tipo.trim() || null,
        entidade: dados.entidade.trim() || null,
        latitude: Number(dados.latitude),
        longitude: Number(dados.longitude)
      })
      setBases((lista) => [...lista, criada].sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt')))
      setDados(inicial)
    } catch (e) {
      setErro(e.message || 'N\u00e3o foi poss\u00edvel guardar a base.')
    } finally {
      bloqueio.current = false
      setGuardando(false)
    }
  }

  const campos = [
    ['nome', 'Nome da base *', 200],
    ['tipo', 'Tipo', 100],
    ['entidade', 'Entidade', 200],
    ['ilha', 'Ilha *', 100]
  ]

  return (
    <div>
      <h3>{'Bases da opera\u00e7\u00e3o'} ({bases.length})</h3>
      <p>{'Defina os edif\u00edcios ou bases tempor\u00e1rias desta opera\u00e7\u00e3o.'}</p>
      {erro && <div className="operacoes-erro" role="alert">{erro}</div>}
      {carregando ? <p>A carregar bases...</p> : (
        bases.length === 0 ? <p>{'Ainda n\u00e3o existem bases nesta opera\u00e7\u00e3o.'}</p> :
        <div className="participantes-lista">
          {bases.map((base) => (
            <article className="participante-item" key={base.id}>
              <div>
                <strong>{base.nome}</strong>
                <p>{[base.tipo, base.entidade, base.ilha].filter(Boolean).join(' \u00b7 ')}</p>
                <small>Latitude: {base.latitude} | Longitude: {base.longitude}</small>
              </div>
            </article>
          ))}
        </div>
      )}
      <form className="novo-recurso-caixa" onSubmit={guardar}>
        <h3>Registar base</h3>
        <fieldset disabled={guardando || !carregado} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="campos-duplos">
            {campos.map(([campo, rotulo, limite]) => (
              <div key={campo}>
                <label htmlFor={`base-${campo}`}>{rotulo}</label>
                <input id={`base-${campo}`} value={dados[campo]}
                  maxLength={limite} required={campo === 'nome' || campo === 'ilha'}
                  onChange={(e) => setDados({ ...dados, [campo]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="campos-duplos">
            {['latitude', 'longitude'].map((campo) => (
              <div key={campo}>
                <label htmlFor={`base-${campo}`}>{campo === 'latitude' ? 'Latitude *' : 'Longitude *'}</label>
                <input id={`base-${campo}`} type="number" step="any" required
                  min={campo === 'latitude' ? -90 : -180}
                  max={campo === 'latitude' ? 90 : 180}
                  value={dados[campo]}
                  onChange={(e) => setDados({ ...dados, [campo]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="modal-acoes">
            <button className="botao-primario" type="submit">
              {guardando ? 'A guardar...' : 'Guardar base'}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  )
}
