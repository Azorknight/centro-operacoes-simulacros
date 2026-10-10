import { useRef, useState } from 'react'
import { atribuirBaseInicial } from '../services/api'

export default function BaseInicialParticipante({
  operacaoId, tipo, item, bases, onGuardada
}) {
  const [baseId, setBaseId] = useState(String(item.base_inicial_id || ''))
  const [erro, setErro] = useState('')
  const [guardando, setGuardando] = useState(false)
  const bloqueio = useRef(false)

  async function guardar(evento) {
    evento.preventDefault()
    if (!baseId || bloqueio.current) return
    bloqueio.current = true
    setGuardando(true)
    setErro('')
    try {
      const catalogoId = tipo === 'recursos'
        ? item.recurso_catalogo_id : item.elemento_catalogo_id
      await atribuirBaseInicial(operacaoId, tipo, catalogoId, baseId)
      await onGuardada()
    } catch (e) {
      setErro(e.message || 'N\u00e3o foi poss\u00edvel atribuir a base.')
    } finally {
      bloqueio.current = false
      setGuardando(false)
    }
  }

  return (
    <form className="novo-recurso-caixa" onSubmit={guardar}>
      <p>Base inicial: <strong>{item.base_inicial_nome || 'Por definir'}</strong></p>
      {bases.length === 0 ? (
        <p>Registe primeiro uma base no separador Bases.</p>
      ) : (
        <>
          <label>
            Base inicial
            <select value={baseId} disabled={guardando}
              onChange={(e) => { setBaseId(e.target.value); setErro('') }}>
              <option value="">Selecionar...</option>
              {bases.map((base) => (
                <option key={base.id} value={base.id}>
                  {base.nome} ({base.ilha})
                </option>
              ))}
            </select>
          </label>
          <p>{'Define a posi\u00e7\u00e3o inicial no mapa. Meios utilizados ou reposicionados mant\u00eam a posi\u00e7\u00e3o atual.'}</p>
          <button type="submit"
            disabled={guardando || !baseId ||
              Number(baseId) === Number(item.base_inicial_id)}>
            {guardando ? 'A guardar...' : 'Guardar base inicial'}
          </button>
        </>
      )}
      {erro && <div className="operacoes-erro" role="alert">{erro}</div>}
    </form>
  )
}
