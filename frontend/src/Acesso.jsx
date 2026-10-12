import { useEffect, useState } from 'react'
import { apiUrl } from './services/apiUrl'

export default function Acesso({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!import.meta.env.DEV)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (import.meta.env.DEV) return
    fetch(apiUrl('/auth/me')).then(r => r.ok ? r.json() : null)
      .then(setUser).catch(() => setError('Não foi possível contactar o servidor.'))
      .finally(() => setLoading(false))
  }, [])
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
  if (import.meta.env.DEV) return children
  if (loading) return <p>A verificar sessão…</p>
  if (!user) return <main style={{ maxWidth: 420, margin: '10vh auto', padding: 24 }}>
    <h1>SGO</h1><p>Entre com a sua conta do SGO.</p>
    <form onSubmit={login} style={{ display: 'grid', gap: 12 }}>
      <label>Utilizador<input name="username" autoComplete="username" required /></label>
      <label>Palavra-passe<input name="password" type="password" autoComplete="current-password" required /></label>
      <button disabled={busy}>{busy ? 'A entrar…' : 'Entrar'}</button>
    </form>{error && <p role="alert">{error}</p>}
  </main>
  return <><div style={{ position: 'fixed', bottom: 8, left: 240, zIndex: 10000, background: 'white', padding: 8, borderRadius: 8 }}>
    {user.username || user.name} · {user.role === 'responsavel' ? 'Responsável' : 'Operador'}{' '}
    <button onClick={logout} disabled={busy}>Sair</button>{error && <span role="alert">{error}</span>}
  </div>{children}</>
}
