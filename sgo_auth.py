"""Contas locais do SGO. Nunca aceita o perfil enviado pelo navegador."""
import hashlib, hmac, json, os, re, secrets, sqlite3, time
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel, Field
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
    if role not in ('operador', 'responsavel', 'administrador'): raise ValueError('Perfil inválido')
    name = name.strip().lower()
    if not name or len(name) > 100 or not 8 <= len(password) <= 256: raise ValueError('Nome obrigatório; palavra-passe com pelo menos 8 caracteres')
    salt = secrets.token_hex(16)
    with connect() as c:
        c.execute('INSERT INTO users VALUES (?,?,?,?,1) ON CONFLICT(name) DO UPDATE SET salt=excluded.salt,digest=excluded.digest,role=excluded.role,enabled=1', (name,salt,digest(password,salt),role))
        c.execute('DELETE FROM sessions WHERE name=?',(name,))

def permitted(role, method, path):
    if path in ('/auth/me', '/auth/logout'): return True
    if path == '/auth/users' or path.startswith('/auth/users/'):
        return role == 'administrador'
    if role in ('responsavel', 'administrador'): return True
    if role != 'operador': return False
    import re
    if path.startswith(('/backups', '/auth/users', '/docs', '/openapi.json', '/redoc', '/replay')):
        return False
    if method == 'POST' and path == '/operacoes': return False
    if method == 'PUT' and re.fullmatch(r'/operacoes/\d+/(arquivar|restaurar)', path):
        return False
    return True


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
        if not permitted(row['role'],request.method,path):
            detail = 'Esta ação exige perfil de administrador' if path.startswith('/auth/users') else 'Esta ação exige perfil de responsável'
            return JSONResponse({'detail':detail},403)
        response=await call_next(request)
        if request.method not in ('GET','HEAD','OPTIONS'):
            with connect() as c: c.execute('INSERT INTO audit(at,name,method,path,status) VALUES (?,?,?,?,?)',(time.time(),row['name'],request.method,path,response.status_code))
        return response

class NovaConta(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=256)
    role: str

class AlterarConta(BaseModel):
    password: str | None = Field(default=None, min_length=8, max_length=256)
    role: str
    enabled: bool

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

    @app.get('/auth/users')
    async def users():
        with connect() as c:
            return [dict(r) for r in c.execute('SELECT name,role,enabled FROM users ORDER BY name')]

    @app.post('/auth/users', status_code=201)
    async def create_user(data: NovaConta):
        name = data.name.strip().lower()
        if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{0,99}', name) or data.role not in ('operador', 'responsavel'):
            raise HTTPException(422, 'Nome: letras sem acentos, números, ponto, hífen ou sublinhado; perfil operador ou responsável')
        salt = secrets.token_hex(16)
        hashed = digest(data.password, salt)
        with connect() as c:
            try:
                c.execute('INSERT INTO users VALUES (?,?,?,?,1)', (name,salt,hashed,data.role))
            except sqlite3.IntegrityError:
                raise HTTPException(409, 'Já existe uma conta com este nome')
        return {'name':name, 'role':data.role, 'enabled':True}

    @app.put('/auth/users/{name}')
    async def update_user(name: str, data: AlterarConta, request: Request):
        name = name.strip().lower()
        if data.role not in ('operador', 'responsavel', 'administrador'):
            raise HTTPException(422, 'Perfil inválido')
        salt = secrets.token_hex(16) if data.password is not None else None
        hashed = digest(data.password, salt) if salt else None
        with connect() as c:
            c.execute('BEGIN IMMEDIATE')
            row = c.execute('SELECT role FROM users WHERE name=?', (name,)).fetchone()
            if row is None:
                raise HTTPException(404, 'Conta inexistente')
            if row['role'] == 'administrador' or data.role == 'administrador':
                raise HTTPException(409, 'Contas de administrador são geridas no servidor')
            c.execute('UPDATE users SET role=?,enabled=? WHERE name=?', (data.role,int(data.enabled),name))
            if salt:
                c.execute('UPDATE users SET salt=?,digest=? WHERE name=?', (salt,hashed,name))
            c.execute('DELETE FROM sessions WHERE name=?', (name,))
        return {'name':name, 'role':data.role, 'enabled':data.enabled}
