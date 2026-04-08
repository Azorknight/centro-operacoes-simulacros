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
        conn.commit()

    return {"mensagem": "Ocorrência criada com sucesso"}