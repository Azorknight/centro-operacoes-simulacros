"""Contas locais do SGO. Nunca aceita o perfil enviado pelo navegador."""
import hashlib, hmac, json, os, secrets, sqlite3, time
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

COOKIE = 'sgo_session'


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()

def connect():
    path = Path(os.environ['SGO_AUTH_DB'])
    path.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(path, timeout=15, factory=ClosingConnection)
    c.row_factory = sqlite3.Row
    c.executescript('''
    CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, salt TEXT NOT NULL,
      digest TEXT NOT NULL, role TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, name TEXT NOT NULL, expires REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, failures INTEGER NOT NULL, until REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at REAL NOT NULL,
      name TEXT, method TEXT, path TEXT, status INTEGER);
    ''')
    return c

def digest(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()

def set_user(name, password, role):
    if role not in ('operador', 'responsavel'): raise ValueError('Perfil inválido')
    name = name.strip().lower()
    if not name or len(password) < 8: raise ValueError('Nome obrigatório; palavra-passe com pelo menos 8 caracteres')
    salt = secrets.token_hex(16)
    with connect() as c:
        c.execute('INSERT INTO users VALUES (?,?,?,?,1) ON CONFLICT(name) DO UPDATE SET salt=excluded.salt,digest=excluded.digest,role=excluded.role,enabled=1', (name,salt,digest(password,salt),role))
        c.execute('DELETE FROM sessions WHERE name=?',(name,))

def permitted(role, method, path):
    if path in ('/auth/me','/auth/logout'): return True
    if role == 'responsavel': return True
    if method in ('GET','HEAD'): return not path.startswith(('/backups','/auth/users','/docs','/openapi.json','/redoc'))
    # O operador regista comunicações e execução de instruções já emitidas.
    import re
    return (method == 'POST' and (path == '/ocorrencias' or re.fullmatch(r'/ocorrencias/\d+/(chamadas|situacao)',path) is not None)) or (method == 'PUT' and re.fullmatch(r'/(recursos/\d+/confirmar-chegada|elementos/\d+/(confirmar-chegada|posicao|reembarcar/\d+)|ordens/\d+/estado)',path) is not None)

class Guard(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path=request.url.path
        if request.method not in ('GET','HEAD','OPTIONS'):
            if request.headers.get('origin') != os.environ['SGO_PUBLIC_ORIGIN']:
                return JSONResponse({'detail':'Origem do pedido não autorizada'},403)
        if path == '/auth/login' and request.method == 'POST': return await call_next(request)
        token=request.cookies.get(COOKIE,'')
        with connect() as c:
            row=c.execute('SELECT u.name,u.role FROM sessions s JOIN users u ON u.name=s.name WHERE s.token=? AND s.expires>? AND u.enabled=1',(hashlib.sha256(token.encode()).hexdigest(),time.time())).fetchone()
        if not row: return JSONResponse({'detail':'Autenticação necessária'},401)
        request.state.user=dict(row)
        if not permitted(row['role'],request.method,path): return JSONResponse({'detail':'Esta ação exige perfil de responsável'},403)
        response=await call_next(request)
        if request.method not in ('GET','HEAD','OPTIONS'):
            with connect() as c: c.execute('INSERT INTO audit(at,name,method,path,status) VALUES (?,?,?,?,?)',(time.time(),row['name'],request.method,path,response.status_code))
        return response

def install(app):
    if not os.environ.get('SGO_AUTH_DB') or not os.environ.get('SGO_PUBLIC_ORIGIN','').startswith('https://'):
        raise RuntimeError('Configurar SGO_AUTH_DB e SGO_PUBLIC_ORIGIN HTTPS antes de iniciar')
    app.add_middleware(Guard)
    @app.post('/auth/login')
    async def login(request: Request):
        try:
            body=await request.json(); name=str(body.get('username','')).strip().lower(); password=str(body.get('password',''))
        except Exception: return JSONResponse({'detail':'Pedido inválido'},400)
        if len(name)>100 or len(password)>256:return JSONResponse({'detail':'Credenciais inválidas'},401)
        # Limite persistente por conta e endereço. Em proxy local, este limite
        # por endereço é global e intencionalmente conservador.
        keys=['user:'+name,'ip:'+str(request.client.host)]
        now=time.time()
        with connect() as c:
            for key in keys:
                a=c.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
                if a and a['failures']>=10 and a['until']>now:return JSONResponse({'detail':'Aguarde 15 minutos antes de tentar novamente'},429)
            row=c.execute('SELECT * FROM users WHERE name=? AND enabled=1',(name,)).fetchone()
            calculated=digest(password,row['salt'] if row else '00'*16)
            if not row or not hmac.compare_digest(calculated,row['digest']):
                for key in keys:
                    c.execute('INSERT INTO attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN until<? THEN 1 ELSE failures+1 END,until=excluded.until',(key,now+900,now))
                return JSONResponse({'detail':'Utilizador ou palavra-passe incorretos'},401)
            for key in keys:c.execute('DELETE FROM attempts WHERE key=?',(key,))
            token=secrets.token_urlsafe(32)
            c.execute('DELETE FROM sessions WHERE expires<?',(now,))
            c.execute('INSERT INTO sessions VALUES (?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),name,now+8*3600))
        response=JSONResponse({'username':name,'role':row['role']})
        response.set_cookie(COOKIE,token,max_age=8*3600,secure=True,httponly=True,samesite='strict',path='/api')
        return response
    @app.get('/auth/me')
    async def me(request: Request):return request.state.user
    @app.post('/auth/logout')
    async def logout(request: Request):
        with connect() as c:c.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(request.cookies.get(COOKIE,'').encode()).hexdigest(),))
        response=JSONResponse({'ok':True});response.delete_cookie(COOKIE,path='/api',secure=True,httponly=True,samesite='strict');return response
