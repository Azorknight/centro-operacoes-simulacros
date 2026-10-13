import { createContext, useContext, useState } from 'react'
import './Acesso.css'
import Utilizadores from './Utilizadores'
import { apiUrl } from './services/apiUrl'

const SessaoContext = createContext(null)

export function useResponsavel() {
  return ['responsavel', 'administrador'].includes(useContext(SessaoContext)?.user?.role)
}

export function ContaSessao() {
  const sessao = useContext(SessaoContext)
  const [gestao, setGestao] = useState(false)
  if (!sessao?.user) return null
  return (
    <div className="sgo-conta">
      <div className="sgo-conta-identidade">
        <strong title={sessao.user.username || sessao.user.name}>
          {sessao.user.username || sessao.user.name}
        </strong>
        <span>{sessao.user.role === 'administrador' ? 'Administrador' : sessao.user.role === 'responsavel' ? 'Responsável' : 'Operador'}</span>
      </div>
      <button type="button" onClick={sessao.logout}
        disabled={sessao.busy || sessao.desenvolvimento}>
        {sessao.busy ? 'A sair…' : 'Sair'}
      </button>
      {sessao.user.role === 'administrador' && <button type="button" onClick={() => setGestao(true)}>Utilizadores</button>}
      {gestao && <Utilizadores onFechar={() => setGestao(false)} />}
      {sessao.error && <span className="sgo-conta-erro" role="alert">{sessao.error}</span>}
    </div>
  )
}

export default function Acesso({ children }) {
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function login(event) {
    event.preventDefault(); setBusy(true); setError('')
    const data = new FormData(event.currentTarget)
    try {
      const r = await fetch(apiUrl('/auth/login'), { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: data.get('username'), password: data.get('password') }) })
      const body = await r.json()
      if (!r.ok) throw new Error(body.detail || 'Não foi possível iniciar sessão.')
      setUser(body)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function logout() {
    setBusy(true)
    try {
      const r = await fetch(apiUrl('/auth/logout'), { method: 'POST' })
      if (!r.ok) throw new Error('Não foi possível terminar a sessão.')
      window.location.reload()
    } catch (e) { setError(e.message); setBusy(false) }
  }
  const mostrarLogin = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('visual') === 'login'
    : !user
  if (mostrarLogin) return (
    <main className="sgo-acesso">
      <section className="sgo-acesso-cartao" aria-labelledby="sgo-acesso-titulo">
        <div className="sgo-acesso-marca">
          <span className="sgo-acesso-logo" aria-hidden="true">SGO</span>
          <div><h1 id="sgo-acesso-titulo">Sistema de Gestão Operacional</h1>
            <p>Gestão de exercícios e simulacros</p></div>
        </div>
        <div className="sgo-acesso-conteudo">
          <h2>Entrar no SGO</h2>
          <p>Introduza os dados da sua conta para continuar.</p>
          <form onSubmit={import.meta.env.DEV ? (event) => {
            event.preventDefault()
            setError('Pré-visualização do login no desenvolvimento.')
          } : login}>
            <label htmlFor="sgo-utilizador">Utilizador</label>
            <input id="sgo-utilizador" name="username" autoComplete="username"
              autoCapitalize="none" spellCheck={false} required disabled={busy} />
            <label htmlFor="sgo-password">Palavra-passe</label>
            <input id="sgo-password" name="password" type="password"
              autoComplete="current-password" required disabled={busy} />
            {error && <p className="sgo-acesso-erro" role="alert">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? 'A entrar…' : 'Entrar'}</button>
          </form>
        </div>
      </section>
    </main>
  )
  const sessao = {
    user: import.meta.env.DEV ? { name: 'Desenvolvimento', role: 'responsavel' } : user,
    logout, busy, error, desenvolvimento: import.meta.env.DEV
  }
  return <SessaoContext.Provider value={sessao}>{children}</SessaoContext.Provider>
}
