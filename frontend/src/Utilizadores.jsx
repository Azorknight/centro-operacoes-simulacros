import { useEffect, useRef, useState } from 'react'
import { apiUrl } from './services/apiUrl'
import './Utilizadores.css'

export default function Utilizadores({ onFechar }) {
  const [contas, setContas] = useState([])
  const [selecionada, setSelecionada] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [busy, setBusy] = useState(false)
  const bloqueio = useRef(false)
  async function pedido(path, options) {
    const r = await fetch(apiUrl(path), options)
    const data = await r.json()
    if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Verifique os campos preenchidos.')
    return data
  }
  async function carregar() {
    setContas(await pedido('/auth/users'))
  }
  useEffect(() => {
    carregar().catch(e => setErro(e.message))
  }, [])
  async function guardar(event) {
    event.preventDefault()
    if (bloqueio.current) return
    const form = event.currentTarget
    const dados = new FormData(form)
    const password = dados.get('password')
    if (password !== dados.get('repetir')) { setErro('As palavras-passe não coincidem.'); return }
    const body = { role: dados.get('role') }
    if (selecionada) { body.enabled = dados.get('enabled') === 'on'; if (password) body.password = password }
    else { body.name = dados.get('name'); body.password = password }
    bloqueio.current = true; setBusy(true); setErro(''); setAviso('')
    try {
      await pedido(selecionada ? `/auth/users/${encodeURIComponent(selecionada.name)}` : '/auth/users', {
        method: selecionada ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      form.reset(); setSelecionada(null)
      setAviso('Conta guardada. As sessões anteriores desta conta foram terminadas.')
      await carregar()
    } catch (e) { setErro(e.message) }
    finally { bloqueio.current = false; setBusy(false) }
  }
  return <div className="sgo-users-overlay">
    <section className="sgo-users-panel" role="dialog" aria-modal="true" aria-labelledby="users-title">
      <header><h2 id="users-title">Gestão de utilizadores</h2><button onClick={onFechar} disabled={busy} aria-label="Fechar gestão de utilizadores">Fechar</button></header>
      {erro && <p role="alert">{erro}</p>}{aviso && <p role="status">{aviso}</p>}
      <div className="sgo-users-list">{contas.map(c => <div key={c.name}>
        <strong>{c.name}</strong><span>{c.role === 'administrador' ? 'Administrador' : c.role === 'responsavel' ? 'Responsável' : 'Operador'} · {c.enabled ? 'Ativa' : 'Desativada'}</span>
        {c.role !== 'administrador' && <button disabled={busy} onClick={() => { setSelecionada(c); setErro(''); setAviso('') }}>Editar</button>}
      </div>)}</div>
      <form key={selecionada?.name || 'nova'} onSubmit={guardar}>
        <h3>{selecionada ? `Editar ${selecionada.name}` : 'Criar utilizador'}</h3>
        <fieldset disabled={busy}>
          {!selecionada && <label>Utilizador<input name="name" required maxLength={100} pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]*" title="Letras sem acentos, números, ponto, hífen ou sublinhado" autoComplete="off" /></label>}
          <label>Perfil<select name="role" defaultValue={selecionada?.role || 'operador'}><option value="operador">Operador</option><option value="responsavel">Responsável</option></select></label>
          <label>{selecionada ? 'Nova palavra-passe (em branco: manter)' : 'Palavra-passe (mínimo 8 caracteres)'}<input name="password" type="password" minLength={8} maxLength={256} required={!selecionada} autoComplete="new-password" /></label>
          <label>Repetir palavra-passe<input name="repetir" type="password" minLength={8} maxLength={256} required={!selecionada} autoComplete="new-password" /></label>
          {selecionada && <label><input name="enabled" type="checkbox" defaultChecked={!!selecionada.enabled} /> Conta ativa</label>}
          <div><button type="submit">{busy ? 'A guardar…' : 'Guardar conta'}</button>{selecionada && <button type="button" onClick={() => setSelecionada(null)}>Cancelar edição</button>}</div>
        </fieldset>
      </form>
    </section>
  </div>
}
