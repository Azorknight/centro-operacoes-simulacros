"""Executar na raiz com python tests/test_admin_isolado.py; usa apenas SQLite temporário."""
import os
import secrets
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
import sgo_auth

origin = 'https://sgo-teste.local'
headers = {'Origin': origin}
password = secrets.token_urlsafe(18)

def check(r, code):
    assert r.status_code == code, (r.status_code, r.text, code)
    return r

with tempfile.TemporaryDirectory(prefix='sgo_admin_') as folder:
    os.environ['SGO_AUTH_DB'] = str(Path(folder) / 'contas.sqlite3')
    os.environ['SGO_PUBLIC_ORIGIN'] = origin
    app = FastAPI()
    @app.post('/ordens')
    def ordem(): return {'ok': True}
    @app.post('/operacoes')
    def operacao(): return {'ok': True}
    sgo_auth.install(app)
    for name, role in [('admin', 'administrador'), ('resp', 'responsavel'), ('op', 'operador')]:
        sgo_auth.set_user(name, password, role)
    async def proxy(scope, receive, send):
        if scope['type'] == 'http':
            scope = dict(scope)
            scope['path'] = scope['path'].removeprefix('/api')
            scope['raw_path'] = scope['path'].encode()
        await app(scope, receive, send)
    def login(c, name, pw=password):
        return check(c.post('/api/auth/login', headers=headers, json={'username':name, 'password':pw}), 200)
    with TestClient(proxy, base_url=origin) as admin, TestClient(proxy, base_url=origin) as other:
        check(other.get('/api/auth/users'), 401)
        for name in ['resp', 'op']:
            login(other, name)
            check(other.get('/api/auth/users'), 403)
            check(other.post('/api/auth/users', headers=headers, json={'name':'intruso','password':password,'role':'responsavel'}), 403)
            check(other.put('/api/auth/users/op', headers=headers, json={'role':'responsavel','enabled':True}), 403)
        check(other.post('/api/ordens', headers=headers), 200)
        check(other.post('/api/operacoes', headers=headers), 403)
        login(admin, 'admin')
        check(admin.post('/api/operacoes', headers=headers), 200)
        check(admin.get('/api/auth/users'), 200)
        body={'name':' Novo ', 'password':password, 'role':'operador'}
        check(admin.post('/api/auth/users', headers={'Origin':'https://outro.local'}, json=body), 403)
        created=check(admin.post('/api/auth/users', headers=headers, json=body), 201).json()
        assert created['name']=='novo'
        check(admin.post('/api/auth/users', headers=headers, json=body), 409)
        check(admin.post('/api/auth/users', headers=headers, json={**body,'name':'curta','password':'1234567'}), 422)
        check(admin.post('/api/auth/users', headers=headers, json={**body,'name':'admin2','role':'administrador'}), 422)
        accounts=admin.get('/api/auth/users').json()
        assert all(set(c)=={'name','role','enabled'} for c in accounts)
        login(other, 'novo')
        new_password=secrets.token_urlsafe(18)
        check(admin.put('/api/auth/users/novo', headers=headers, json={'role':'responsavel','enabled':True,'password':new_password}), 200)
        check(other.get('/api/auth/me'), 401)
        check(other.post('/api/auth/login', headers=headers, json={'username':'novo','password':password}), 401)
        login(other, 'novo', new_password)
        check(other.post('/api/operacoes', headers=headers), 200)
        check(admin.put('/api/auth/users/novo', headers=headers, json={'role':'operador','enabled':False}), 200)
        check(other.get('/api/auth/me'), 401)
        check(other.post('/api/auth/login', headers=headers, json={'username':'novo','password':new_password}), 401)
        check(admin.put('/api/auth/users/admin', headers=headers, json={'role':'operador','enabled':False}), 409)
        check(admin.put('/api/auth/users/resp', headers=headers, json={'role':'administrador','enabled':True}), 409)
        check(admin.put('/api/auth/users/inexistente', headers=headers, json={'role':'operador','enabled':True}), 404)
        with sgo_auth.connect() as conn:
            assert conn.execute('SELECT COUNT(*) FROM audit WHERE path LIKE ? AND status=200', ('/auth/users/%',)).fetchone()[0] >= 2
        print('SUCESSO: criacao, edicao, permissoes, origem, invalidacao de sessoes e auditoria.')
print('SUCESSO: base temporaria eliminada; contas reais nao utilizadas.')
