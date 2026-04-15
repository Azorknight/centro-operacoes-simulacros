from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import testar_ligacao
from pydantic import BaseModel

class Recurso(BaseModel):
    nome: str
    tipo: str
    estado: str
    ilha: str
    latitude: float
    longitude: float

class Ocorrencia(BaseModel):
        titulo: str
        descricao: str
        tipo: str
        estado: str
        ilha: str
        latitude: float
        longitude: float

app = FastAPI(
    title="Centro de Operações e Simulacros"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def inicio():
    return {"mensagem": "Centro de Operações e Simulacros ativo"}

@app.get("/teste-bd")
def teste_bd():
    resultado = testar_ligacao()
    return {"resultado": resultado}

from sqlalchemy import text
from database import engine

@app.get("/recursos")
def listar_recursos():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
        SELECT 
            id,
            nome,
            tipo,
            estado,
            ilha,
            ocorrencia_id,
            ST_Y(localizacao) AS latitude,
            ST_X(localizacao) AS longitude,
            criado_em
        FROM recursos
"""))
        dados = []
        for linha in resultado:
            dados.append(dict(linha._mapping))
        return dados
    
@app.post("/recursos")
def criar_recurso(recurso: Recurso):
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO recursos (nome, tipo, estado, ilha, localizacao)
                VALUES (
                    :nome,
                    :tipo,
                    :estado,
                    :ilha,
                    ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
                )
            """),
            {
                "nome": recurso.nome,
                "tipo": recurso.tipo,
                "estado": recurso.estado,
                "ilha": recurso.ilha,
                "latitude": recurso.latitude,
                "longitude": recurso.longitude
            }
        )
        conn.execute(
    text("""
        INSERT INTO timeline_eventos (tipo, descricao)
        VALUES ('recurso', :descricao)
    """),
    {
        "descricao": f"Recurso criado: {recurso.nome} ({recurso.tipo})"
    }
)
        conn.commit()
    return {"mensagem": "Recurso criado com localização"}

@app.get("/ocorrencias")
def listar_ocorrencias():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT
                id,
                titulo,
                descricao,
                tipo,
                estado,
                ilha,
                ST_Y(localizacao) AS latitude,
                ST_X(localizacao) AS longitude,
                criado_em
            FROM ocorrencias
        """))

        dados = []
        for linha in resultado:
            dados.append(dict(linha._mapping))

        return dados


@app.post("/ocorrencias")
def criar_ocorrencia(ocorrencia: Ocorrencia):
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO ocorrencias (titulo, descricao, tipo, estado, ilha, localizacao)
                VALUES (
                    :titulo,
                    :descricao,
                    :tipo,
                    :estado,
                    :ilha,
                    ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
                )
            """),
            {
                "titulo": ocorrencia.titulo,
                "descricao": ocorrencia.descricao,
                "tipo": ocorrencia.tipo,
                "estado": ocorrencia.estado,
                "ilha": ocorrencia.ilha,
                "latitude": ocorrencia.latitude,
                "longitude": ocorrencia.longitude
            }
        )

        conn.execute(
            text("""
                INSERT INTO timeline_eventos (tipo, descricao)
                VALUES ('ocorrencia', :descricao)
            """),
            {
                "descricao": f"Ocorrência criada: {ocorrencia.titulo}"
            }
        )

        conn.commit()

    return {"mensagem": "Ocorrência criada com sucesso"}

@app.get("/timeline")
def listar_timeline():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT id, tipo, descricao, criado_em
            FROM timeline_eventos
            ORDER BY criado_em DESC
        """))

        dados = []
        for linha in resultado:
            dados.append(dict(linha._mapping))

        return dados
    
@app.put("/recursos/{recurso_id}/estado")
def atualizar_estado(recurso_id: int, dados: dict):
    with engine.connect() as conn:
        conn.execute(
            text("""
                UPDATE recursos
                SET estado = :estado
                WHERE id = :id
            """),
            {
                "estado": dados["estado"],
                "id": recurso_id
            }
        )

        conn.execute(
            text("""
                INSERT INTO timeline_eventos (tipo, descricao)
                VALUES ('estado', :descricao)
            """),
            {
                "descricao": f"Recurso {recurso_id} mudou estado para {dados['estado']}"
            }
        )

        conn.commit()

    return {"mensagem": "Estado atualizado"}

@app.put("/recursos/{recurso_id}/posicao")
def atualizar_posicao(recurso_id: int, dados: dict):
    with engine.connect() as conn:
        conn.execute(
            text("""
                UPDATE recursos
                SET localizacao = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
                WHERE id = :id
            """),
            {
                "latitude": dados["latitude"],
                "longitude": dados["longitude"],
                "id": recurso_id
            }
        )

        conn.execute(
            text("""
                INSERT INTO timeline_eventos (tipo, descricao)
                VALUES ('movimento', :descricao)
            """),
            {
                "descricao": f"Recurso {recurso_id} movido"
            }
        )

        conn.commit()

    return {"mensagem": "Posição atualizada"}

@app.get("/bases")
def listar_bases():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT
                id,
                nome,
                tipo,
                ilha,
                ST_Y(localizacao) AS latitude,
                ST_X(localizacao) AS longitude,
                criado_em
            FROM bases
        """))

        dados = []
        for linha in resultado:
            dados.append(dict(linha._mapping))

        return dados
    
@app.put("/recursos/{recurso_id}/atribuir-ocorrencia/{ocorrencia_id}")
def atribuir_ocorrencia(recurso_id: int, ocorrencia_id: int):
    print(">>> A executar atribuir_ocorrencia")

    try:
        with engine.begin() as conn:
            print(">>> Atualizar recurso")

            conn.execute(
                text("""
                    UPDATE recursos
                    SET ocorrencia_id = :ocorrencia_id,
                        estado = 'em_missao'
                    WHERE id = :recurso_id
                """),
                {
                    "ocorrencia_id": ocorrencia_id,
                    "recurso_id": recurso_id
                }
            )

            print(">>> Inserir timeline")

            conn.execute(
                text("""
                    INSERT INTO timeline_eventos (tipo, descricao, recurso_id, ocorrencia_id)
                    VALUES ('missao', :descricao, :recurso_id, :ocorrencia_id)
                """),
                {
                    "descricao": f"Recurso {recurso_id} atribuído à ocorrência {ocorrencia_id}",
                    "recurso_id": recurso_id,
                    "ocorrencia_id": ocorrencia_id
                }
            )

        print(">>> OK")
        return {"mensagem": "Recurso atribuído à ocorrência"}

    except Exception as e:
        print(">>> ERRO:", e)
        return {"erro": str(e)}
    
@app.get("/ordens")
def listar_ordens():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT id, titulo, descricao, estado, recurso_id, ocorrencia_id, criado_em
            FROM ordens
            ORDER BY criado_em DESC
        """))

        dados = []
        for linha in resultado:
            dados.append(dict(linha._mapping))

        return dados

class Ordem(BaseModel):
    titulo: str
    descricao: str
    estado: str
    recurso_id: int | None = None
    ocorrencia_id: int | None = None


@app.post("/ordens")
def criar_ordem(ordem: Ordem):
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO ordens (titulo, descricao, estado, recurso_id, ocorrencia_id)
                VALUES (:titulo, :descricao, :estado, :recurso_id, :ocorrencia_id)
            """),
            {
                "titulo": ordem.titulo,
                "descricao": ordem.descricao,
                "estado": ordem.estado,
                "recurso_id": ordem.recurso_id,
                "ocorrencia_id": ordem.ocorrencia_id
            }
        )

        conn.execute(
            text("""
                INSERT INTO timeline_eventos (tipo, descricao)
                VALUES ('ordem', :descricao)
            """),
            {
                "descricao": f"Ordem criada: {ordem.titulo}"
            }
        )

        conn.commit()

    return {"mensagem": "Ordem criada com sucesso"}

@app.put("/ordens/{ordem_id}/estado")
def atualizar_estado_ordem(ordem_id: int, dados: dict):
    with engine.connect() as conn:
        conn.execute(
            text("""
                UPDATE ordens
                SET estado = :estado
                WHERE id = :id
            """),
            {
                "estado": dados["estado"],
                "id": ordem_id
            }
        )

        conn.execute(
            text("""
                INSERT INTO timeline_eventos (tipo, descricao)
                VALUES ('ordem', :descricao)
            """),
            {
                "descricao": f"Ordem {ordem_id} mudou estado para {dados['estado']}"
            }
        )

        conn.commit()

    return {"mensagem": "Estado da ordem atualizado"}

@app.get("/missoes")
def listar_missoes():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT id, titulo, descricao, prioridade, estado, recurso_id, ocorrencia_id, criado_em
            FROM missoes
            ORDER BY criado_em DESC
        """))

        dados = []
        for linha in resultado:
            dados.append(dict(linha._mapping))

        return dados
    
class Missao(BaseModel):
    titulo: str
    descricao: str
    prioridade: str
    estado: str
    recurso_id: int | None = None
    ocorrencia_id: int | None = None


@app.post("/missoes")
def criar_missao(missao: Missao):
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO missoes (titulo, descricao, prioridade, estado, recurso_id, ocorrencia_id)
                VALUES (:titulo, :descricao, :prioridade, :estado, :recurso_id, :ocorrencia_id)
            """),
            {
                "titulo": missao.titulo,
                "descricao": missao.descricao,
                "prioridade": missao.prioridade,
                "estado": missao.estado,
                "recurso_id": missao.recurso_id,
                "ocorrencia_id": missao.ocorrencia_id
            }
        )

        conn.execute(
            text("""
                INSERT INTO timeline_eventos (tipo, descricao)
                VALUES ('missao', :descricao)
            """),
            {
                "descricao": f"Missão criada: {missao.titulo}"
            }
        )

        conn.commit()

    return {"mensagem": "Missão criada com sucesso"}

@app.put("/missoes/{missao_id}/atribuir-recurso/{recurso_id}")
def atribuir_recurso_missao(missao_id: int, recurso_id: int):
    with engine.connect() as conn:
        conn.execute(
            text("""
                UPDATE missoes
                SET recurso_id = :recurso_id,
                    estado = 'em_execucao'
                WHERE id = :missao_id
            """),
            {
                "recurso_id": recurso_id,
                "missao_id": missao_id
            }
        )

        conn.execute(
            text("""
                UPDATE recursos
                SET estado = 'em_missao'
                WHERE id = :recurso_id
            """),
            {
                "recurso_id": recurso_id
            }
        )

        conn.execute(
            text("""
                INSERT INTO timeline_eventos (tipo, descricao)
                VALUES ('missao', :descricao)
            """),
            {
                "descricao": f"Recurso {recurso_id} atribuído à missão {missao_id}"
            }
        )

        conn.commit()

    return {"mensagem": "Recurso atribuído à missão"}