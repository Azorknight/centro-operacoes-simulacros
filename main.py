from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database import testar_ligacao
from pydantic import BaseModel
from datetime import datetime, date, time
from zoneinfo import ZoneInfo
from pathlib import Path
from decimal import Decimal
import base64
import json
import re

def agora_acores():
    return datetime.now(ZoneInfo("Atlantic/Azores")).strftime("%d/%m/%Y %H:%M")

class Recurso(BaseModel):
    nome: str
    tipo: str
    estado: str
    indicativo_radio: str | None = None
    ilha: str
    latitude: float
    longitude: float

class Ocorrencia(BaseModel):
    titulo: str
    descricao: str = ""
    tipo: str
    estado: str = "recebida"
    ilha: str
    latitude: float
    longitude: float

class EstadoOcorrencia(BaseModel):
    estado: str

class Operacao(BaseModel):
    nome: str
    tipo: str
    entidade_organizadora: str | None = None
    local: str | None = None
    objetivo: str | None = None
    descricao: str | None = None
    data_inicio: datetime | None = None
    data_fim: datetime | None = None

class ConfirmacaoEliminacao(BaseModel):
    confirmacao: str

class RecursoCatalogo(BaseModel):
    nome: str
    tipo: str
    entidade_id: int | None = None
    ilha: str | None = None
    estado: str = "ativo"

class ParticipacaoRecurso(BaseModel):
    recurso_catalogo_id: int
    indicativo_operacional: str | None = None
    funcao: str | None = None

class ElementoCatalogo(BaseModel):
    nome: str
    entidade: str | None = None
    estado: str = "ativo"

class ParticipacaoElemento(BaseModel):
    elemento_catalogo_id: int
    indicativo_operacional: str | None = None
    funcao_operacional: str | None = None
    recurso_catalogo_id: int | None = None

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

@app.get("/diagnostico")
def diagnostico_sistema():
    """Diagnóstico simples e não destrutivo dos principais serviços do SGO."""
    verificado_em = datetime.now(ZoneInfo("Atlantic/Azores")).isoformat()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            operacao_id = obter_operacao_ativa_id(conn)
            operacao = None
            contagens = {"recursos": 0, "elementos": 0, "ocorrencias": 0, "timeline": 0, "ordens": 0}

            if operacao_id is not None:
                linha = conn.execute(text("""
                    SELECT id, nome, estado
                    FROM operacoes
                    WHERE id = :id
                """), {"id": operacao_id}).mappings().first()
                operacao = dict(linha) if linha else None

                consultas = {
                    "recursos": "SELECT COUNT(*) FROM recursos WHERE operacao_id=:id",
                    "elementos": "SELECT COUNT(*) FROM elementos WHERE operacao_id=:id",
                    "ocorrencias": "SELECT COUNT(*) FROM ocorrencias WHERE operacao_id=:id",
                    "timeline": "SELECT COUNT(*) FROM timeline_eventos WHERE operacao_id=:id",
                    "ordens": "SELECT COUNT(*) FROM ordens WHERE operacao_id=:id",
                }
                for chave, sql in consultas.items():
                    contagens[chave] = int(conn.execute(text(sql), {"id": operacao_id}).scalar() or 0)

            return {
                "ok": True,
                "verificado_em": verificado_em,
                "api": {"ok": True, "mensagem": "Ligada"},
                "base_dados": {"ok": True, "mensagem": "Ligada"},
                "timeline": {"ok": True, "mensagem": "Operacional", "eventos": contagens["timeline"]},
                "replay": {"ok": True, "mensagem": "Disponível"},
                "polling": {"ok": True, "intervalo_segundos": 5},
                "operacao": operacao,
                "contagens": contagens,
            }
    except Exception as erro:
        return {
            "ok": False,
            "verificado_em": verificado_em,
            "api": {"ok": True, "mensagem": "Ligada"},
            "base_dados": {"ok": False, "mensagem": "Erro de ligação"},
            "timeline": {"ok": False, "mensagem": "Indisponível"},
            "replay": {"ok": False, "mensagem": "Indisponível"},
            "polling": {"ok": True, "intervalo_segundos": 5},
            "operacao": None,
            "contagens": {},
            "erro": str(erro),
        }

from sqlalchemy import text, MetaData, Table, inspect
from database import engine


class ConfirmacaoRestauro(BaseModel):
    confirmacao: str

BACKUP_DIR = Path(__file__).resolve().parent / "backups"
BACKUP_DIR.mkdir(exist_ok=True)
BACKUP_NAME_RE = re.compile(r"^backup_\d{8}_\d{6}\.sgo$")
TABELAS_BACKUP = [
    "entidades", "recursos_catalogo", "elementos_catalogo", "operacoes",
    "configuracao", "bases", "ocorrencias", "recursos", "elementos",
    "setores", "objetivos", "objetivo_modelos", "missoes", "missao_recursos", "missao_notas", "ordens", "timeline_eventos", "operacao_recursos",
    "operacao_elementos",
]

def _serializar_backup(valor):
    if isinstance(valor, datetime):
        return {"__tipo__": "datetime", "valor": valor.isoformat()}
    if isinstance(valor, date):
        return {"__tipo__": "date", "valor": valor.isoformat()}
    if isinstance(valor, time):
        return {"__tipo__": "time", "valor": valor.isoformat()}
    if isinstance(valor, Decimal):
        return {"__tipo__": "decimal", "valor": str(valor)}
    if isinstance(valor, (bytes, bytearray, memoryview)):
        return {"__tipo__": "bytes", "valor": base64.b64encode(bytes(valor)).decode("ascii")}
    return valor

def _desserializar_backup(valor):
    if not isinstance(valor, dict) or "__tipo__" not in valor:
        return valor
    tipo = valor.get("__tipo__")
    conteudo = valor.get("valor")
    if tipo == "datetime":
        return datetime.fromisoformat(conteudo)
    if tipo == "date":
        return date.fromisoformat(conteudo)
    if tipo == "time":
        return time.fromisoformat(conteudo)
    if tipo == "decimal":
        return Decimal(conteudo)
    if tipo == "bytes":
        return base64.b64decode(conteudo)
    return valor

def _caminho_backup(nome: str) -> Path:
    if not BACKUP_NAME_RE.fullmatch(nome or ""):
        raise HTTPException(status_code=400, detail="Nome de backup inválido")
    caminho = (BACKUP_DIR / nome).resolve()
    if caminho.parent != BACKUP_DIR.resolve():
        raise HTTPException(status_code=400, detail="Caminho de backup inválido")
    return caminho

@app.get("/backups")
def listar_backups():
    itens = []
    for caminho in sorted(BACKUP_DIR.glob("backup_*.sgo"), reverse=True):
        try:
            dados = json.loads(caminho.read_text(encoding="utf-8"))
            itens.append({
                "nome": caminho.name,
                "criado_em": dados.get("criado_em"),
                "tabelas": len(dados.get("tabelas", {})),
                "registos": dados.get("total_registos", 0),
                "tamanho_bytes": caminho.stat().st_size,
            })
        except Exception:
            itens.append({
                "nome": caminho.name, "criado_em": None, "tabelas": 0,
                "registos": 0, "tamanho_bytes": caminho.stat().st_size,
                "corrompido": True,
            })
    return itens

@app.post("/backups")
def criar_backup():
    criado_em = datetime.now(ZoneInfo("Atlantic/Azores"))
    nome = criado_em.strftime("backup_%Y%m%d_%H%M%S.sgo")
    caminho = BACKUP_DIR / nome
    metadata = MetaData()
    inspector = inspect(engine)
    existentes = set(inspector.get_table_names(schema="public"))
    tabelas = {}
    total = 0
    with engine.connect() as conn:
        for nome_tabela in TABELAS_BACKUP:
            if nome_tabela not in existentes:
                continue
            tabela = Table(nome_tabela, metadata, autoload_with=engine)
            linhas = conn.execute(tabela.select()).mappings().all()
            tabelas[nome_tabela] = [
                {chave: _serializar_backup(valor) for chave, valor in dict(linha).items()}
                for linha in linhas
            ]
            total += len(linhas)
    conteudo = {
        "formato": "SGO_BACKUP",
        "versao_formato": 1,
        "criado_em": criado_em.isoformat(),
        "total_registos": total,
        "tabelas": tabelas,
    }
    temporario = caminho.with_suffix(".tmp")
    temporario.write_text(json.dumps(conteudo, ensure_ascii=False, indent=2), encoding="utf-8")
    temporario.replace(caminho)
    return {"ok": True, "nome": nome, "criado_em": criado_em.isoformat(), "registos": total}

@app.post("/backups/{nome}/restaurar")
def restaurar_backup(nome: str, dados: ConfirmacaoRestauro):
    if dados.confirmacao.strip().upper() != "RESTAURAR":
        raise HTTPException(status_code=400, detail="Escreva RESTAURAR para confirmar")
    caminho = _caminho_backup(nome)
    if not caminho.exists():
        raise HTTPException(status_code=404, detail="Backup não encontrado")
    try:
        conteudo = json.loads(caminho.read_text(encoding="utf-8"))
    except Exception as erro:
        raise HTTPException(status_code=400, detail=f"Backup inválido: {erro}")
    if conteudo.get("formato") != "SGO_BACKUP" or conteudo.get("versao_formato") != 1:
        raise HTTPException(status_code=400, detail="Formato de backup não suportado")
    tabelas_dados = conteudo.get("tabelas")
    if not isinstance(tabelas_dados, dict):
        raise HTTPException(status_code=400, detail="Backup sem tabelas válidas")

    metadata = MetaData()
    inspector = inspect(engine)
    existentes = set(inspector.get_table_names(schema="public"))
    tabelas = {
        nome_tabela: Table(nome_tabela, metadata, autoload_with=engine)
        for nome_tabela in TABELAS_BACKUP
        if nome_tabela in existentes and nome_tabela in tabelas_dados
    }
    ordem_ordenada = [
        nome_tabela for nome_tabela, _ in inspector.get_sorted_table_and_fkc_names(schema="public")
        if nome_tabela and nome_tabela in tabelas
    ]
    ordem_insercao = ordem_ordenada + [
        nome_tabela for nome_tabela in TABELAS_BACKUP
        if nome_tabela in tabelas and nome_tabela not in ordem_ordenada
    ]
    try:
        with engine.begin() as conn:
            for nome_tabela in reversed(ordem_insercao):
                conn.execute(tabelas[nome_tabela].delete())
            total = 0
            for nome_tabela in ordem_insercao:
                linhas = tabelas_dados.get(nome_tabela, [])
                if not isinstance(linhas, list):
                    raise ValueError(f"Dados inválidos na tabela {nome_tabela}")
                registos = [
                    {chave: _desserializar_backup(valor) for chave, valor in linha.items()}
                    for linha in linhas
                ]
                if registos:
                    conn.execute(tabelas[nome_tabela].insert(), registos)
                    total += len(registos)
                for coluna in tabelas[nome_tabela].primary_key.columns:
                    try:
                        coluna_inteira = coluna.type.python_type is int
                    except (AttributeError, NotImplementedError):
                        coluna_inteira = False
                    if coluna_inteira:
                        sequencia = conn.execute(
                            text("SELECT pg_get_serial_sequence(:tabela, :coluna)"),
                            {"tabela": nome_tabela, "coluna": coluna.name},
                        ).scalar()
                        if sequencia:
                            sql_seq = (
                                f"SELECT setval(CAST(:sequencia AS regclass), "
                                f"COALESCE(MAX(\"{coluna.name}\"), 1), "
                                f"MAX(\"{coluna.name}\") IS NOT NULL) FROM \"{nome_tabela}\""
                            )
                            conn.execute(text(sql_seq), {"sequencia": sequencia})
        return {"ok": True, "nome": nome, "registos_restaurados": total}
    except HTTPException:
        raise
    except Exception as erro:
        raise HTTPException(status_code=500, detail=f"Falha no restauro; nenhuma alteração foi aplicada: {erro}")

@app.delete("/backups/{nome}")
def eliminar_backup(nome: str):
    caminho = _caminho_backup(nome)
    if not caminho.exists():
        raise HTTPException(status_code=404, detail="Backup não encontrado")
    caminho.unlink()
    return {"ok": True, "nome": nome}


def obter_operacao_ativa_id(conn):
    valor = conn.execute(text("""
        SELECT valor FROM configuracao
        WHERE chave = 'operacao_ativa'
    """)).scalar()
    if valor is None or str(valor).strip() == "":
        return None
    return int(valor)


def exigir_operacao_ativa_id(conn):
    operacao_id = obter_operacao_ativa_id(conn)
    if operacao_id is None:
        raise HTTPException(status_code=409, detail="Nenhuma operação ativa")
    return operacao_id


def exigir_operacao_editavel_id(conn):
    operacao_id = exigir_operacao_ativa_id(conn)
    estado = conn.execute(text("SELECT estado FROM operacoes WHERE id = :id"), {"id": operacao_id}).scalar()
    if estado == "concluida":
        raise HTTPException(status_code=409, detail="A operação está concluída e encontra-se em modo de consulta")
    return operacao_id


def preparar_separacao_por_operacao():
    """Atualiza a estrutura sem apagar dados antigos."""
    with engine.begin() as conn:
        for tabela in ("recursos", "ocorrencias", "missoes", "ordens", "timeline_eventos", "elementos"):
            conn.execute(text(f"ALTER TABLE {tabela} ADD COLUMN IF NOT EXISTS operacao_id INTEGER"))

        # Estrutura da Ocorrência Inteligente. As colunas são acrescentadas sem apagar dados.
        for coluna in (
            "recebida_em TIMESTAMP",
            "despachada_em TIMESTAMP",
            "em_curso_em TIMESTAMP",
            "sob_controlo_em TIMESTAMP",
            "encerrada_em TIMESTAMP",
            "arquivada_em TIMESTAMP"
        ):
            conn.execute(text(f"ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS {coluna}"))
        conn.execute(text("UPDATE ocorrencias SET recebida_em = COALESCE(recebida_em, criado_em)"))
        conn.execute(text("UPDATE ocorrencias SET estado = 'recebida' WHERE estado IS NULL OR TRIM(estado) = ''"))
        conn.execute(text("UPDATE ocorrencias SET estado = 'recebida' WHERE LOWER(estado) IN ('aberta', 'aberto')"))
        conn.execute(text("UPDATE ocorrencias SET estado = 'encerrada', encerrada_em = COALESCE(encerrada_em, criado_em) WHERE LOWER(estado) IN ('fechada', 'fechado', 'concluida', 'concluído', 'concluido')"))

        # Estrutura de Missões v1: acrescenta metadados sem eliminar missões existentes.
        for coluna in (
            "responsavel TEXT",
            "notas TEXT",
            "situacao_operacional TEXT DEFAULT 'estavel'",
            "atualizada_em TIMESTAMP",
            "planeada_em TIMESTAMP",
            "iniciada_em TIMESTAMP",
            "concluida_em TIMESTAMP",
            "cancelada_em TIMESTAMP"
        ):
            conn.execute(text(f"ALTER TABLE missoes ADD COLUMN IF NOT EXISTS {coluna}"))
        conn.execute(text("UPDATE missoes SET situacao_operacional = 'estavel' WHERE situacao_operacional IS NULL OR TRIM(situacao_operacional) = ''"))
        conn.execute(text("UPDATE missoes SET atualizada_em = COALESCE(atualizada_em, criado_em)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS missao_notas (
                id SERIAL PRIMARY KEY,
                missao_id INTEGER NOT NULL REFERENCES missoes(id) ON DELETE CASCADE,
                autor TEXT,
                texto TEXT NOT NULL,
                criado_em TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.execute(text("UPDATE missoes SET estado = 'planeada' WHERE estado IS NULL OR TRIM(estado) = ''"))
        conn.execute(text("UPDATE missoes SET planeada_em = COALESCE(planeada_em, criado_em) WHERE estado IN ('planeada', 'em_execucao', 'concluida', 'cancelada')"))
        conn.execute(text("UPDATE missoes SET iniciada_em = COALESCE(iniciada_em, criado_em) WHERE estado = 'em_execucao'"))
        conn.execute(text("UPDATE missoes SET concluida_em = COALESCE(concluida_em, criado_em) WHERE estado = 'concluida'"))

        # Sprint 10.1: setores operacionais editáveis.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS setores (
                id SERIAL PRIMARY KEY,
                operacao_id INTEGER NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
                nome TEXT NOT NULL,
                descricao TEXT DEFAULT '',
                cor TEXT NOT NULL DEFAULT '#2563eb',
                estado TEXT NOT NULL DEFAULT 'ativo',
                comandante TEXT,
                notas TEXT,
                arquivado BOOLEAN NOT NULL DEFAULT FALSE,
                criado_em TIMESTAMP DEFAULT NOW(),
                atualizado_em TIMESTAMP DEFAULT NOW()
            )
        """))

        # Sprint 9.1: objetivos operacionais e modelos editáveis.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS objetivo_modelos (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                descricao TEXT DEFAULT '',
                prioridade TEXT NOT NULL DEFAULT 'normal',
                ativo BOOLEAN NOT NULL DEFAULT TRUE,
                criado_em TIMESTAMP DEFAULT NOW(),
                atualizado_em TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS objetivos (
                id SERIAL PRIMARY KEY,
                operacao_id INTEGER NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
                ocorrencia_id INTEGER REFERENCES ocorrencias(id) ON DELETE SET NULL,
                modelo_id INTEGER REFERENCES objetivo_modelos(id) ON DELETE SET NULL,
                nome TEXT NOT NULL,
                descricao TEXT DEFAULT '',
                prioridade TEXT NOT NULL DEFAULT 'normal',
                estado TEXT NOT NULL DEFAULT 'planeado',
                responsavel TEXT,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                notas TEXT,
                arquivado BOOLEAN NOT NULL DEFAULT FALSE,
                criado_em TIMESTAMP DEFAULT NOW(),
                atualizado_em TIMESTAMP DEFAULT NOW(),
                concluido_em TIMESTAMP
            )
        """))
        conn.execute(text("ALTER TABLE objetivos ADD COLUMN IF NOT EXISTS setor_id INTEGER REFERENCES setores(id) ON DELETE SET NULL"))
        conn.execute(text("ALTER TABLE missoes ADD COLUMN IF NOT EXISTS objetivo_id INTEGER REFERENCES objetivos(id) ON DELETE SET NULL"))
        conn.execute(text("ALTER TABLE missoes ADD COLUMN IF NOT EXISTS setor_id INTEGER REFERENCES setores(id) ON DELETE SET NULL"))

        # Sprint 8.2: uma missão pode ter vários recursos associados.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS missao_recursos (
                id SERIAL PRIMARY KEY,
                missao_id INTEGER NOT NULL REFERENCES missoes(id) ON DELETE CASCADE,
                recurso_id INTEGER NOT NULL REFERENCES recursos(id) ON DELETE CASCADE,
                atribuido_em TIMESTAMP DEFAULT NOW(),
                UNIQUE (missao_id, recurso_id)
            )
        """))
        conn.execute(text("""
            INSERT INTO missao_recursos (missao_id, recurso_id)
            SELECT id, recurso_id
            FROM missoes
            WHERE recurso_id IS NOT NULL
            ON CONFLICT (missao_id, recurso_id) DO NOTHING
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS recursos_catalogo (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                tipo TEXT NOT NULL,
                entidade_id INTEGER REFERENCES entidades(id),
                ilha TEXT,
                estado TEXT NOT NULL DEFAULT 'ativo',
                criado_em TIMESTAMP DEFAULT NOW(),
                UNIQUE (nome, tipo)
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS operacao_recursos (
                id SERIAL PRIMARY KEY,
                operacao_id INTEGER NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
                recurso_catalogo_id INTEGER NOT NULL REFERENCES recursos_catalogo(id),
                indicativo_operacional TEXT,
                funcao TEXT,
                estado TEXT NOT NULL DEFAULT 'participante',
                entrada_em TIMESTAMP DEFAULT NOW(),
                saida_em TIMESTAMP,
                UNIQUE (operacao_id, recurso_catalogo_id)
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS elementos_catalogo (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                entidade TEXT,
                estado TEXT NOT NULL DEFAULT 'ativo',
                criado_em TIMESTAMP DEFAULT NOW(),
                UNIQUE (nome, entidade)
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS operacao_elementos (
                id SERIAL PRIMARY KEY,
                operacao_id INTEGER NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
                elemento_catalogo_id INTEGER NOT NULL REFERENCES elementos_catalogo(id),
                indicativo_operacional TEXT,
                funcao_operacional TEXT,
                recurso_catalogo_id INTEGER REFERENCES recursos_catalogo(id),
                estado TEXT NOT NULL DEFAULT 'participante',
                entrada_em TIMESTAMP DEFAULT NOW(),
                saida_em TIMESTAMP,
                UNIQUE (operacao_id, elemento_catalogo_id)
            )
        """))
        conn.execute(text("ALTER TABLE elementos ADD COLUMN IF NOT EXISTS elemento_catalogo_id INTEGER"))
        conn.execute(text("ALTER TABLE operacao_elementos ADD COLUMN IF NOT EXISTS recurso_catalogo_id INTEGER"))

        conn.execute(text("""
            INSERT INTO elementos_catalogo (nome, entidade)
            SELECT DISTINCT e.nome, NULLIF(e.entidade, '')
            FROM elementos e
            WHERE e.nome IS NOT NULL
            ON CONFLICT (nome, entidade) DO NOTHING
        """))
        conn.execute(text("""
            UPDATE elementos e
            SET elemento_catalogo_id = ec.id
            FROM elementos_catalogo ec
            WHERE e.elemento_catalogo_id IS NULL
              AND ec.nome = e.nome
              AND COALESCE(ec.entidade, '') = COALESCE(e.entidade, '')
        """))
        conn.execute(text("""
            INSERT INTO operacao_elementos (
                operacao_id, elemento_catalogo_id, indicativo_operacional,
                funcao_operacional, estado
            )
            SELECT DISTINCT e.operacao_id, e.elemento_catalogo_id,
                   e.indicativo_radio, e.funcao, 'participante'
            FROM elementos e
            WHERE e.operacao_id IS NOT NULL
              AND e.elemento_catalogo_id IS NOT NULL
            ON CONFLICT (operacao_id, elemento_catalogo_id) DO NOTHING
        """))

        # Liga cada recurso operacional ao respetivo recurso permanente do catálogo.
        conn.execute(text("ALTER TABLE recursos ADD COLUMN IF NOT EXISTS recurso_catalogo_id INTEGER"))
        # Copia para o catálogo os recursos já conhecidos, sem duplicar.
        conn.execute(text("""
            INSERT INTO recursos_catalogo (nome, tipo, ilha)
            SELECT DISTINCT r.nome, r.tipo, r.ilha
            FROM recursos r
            WHERE r.nome IS NOT NULL AND r.tipo IS NOT NULL
            ON CONFLICT (nome, tipo) DO NOTHING
        """))

        # Associa os recursos operacionais já existentes ao catálogo.
        conn.execute(text("""
            UPDATE recursos r
            SET recurso_catalogo_id = rc.id
            FROM recursos_catalogo rc
            WHERE r.recurso_catalogo_id IS NULL
              AND rc.nome = r.nome
              AND rc.tipo = r.tipo
        """))

        # Preserva os recursos que já estavam nas operações, criando a respetiva participação.
        conn.execute(text("""
            INSERT INTO operacao_recursos (
                operacao_id, recurso_catalogo_id, indicativo_operacional, estado
            )
            SELECT DISTINCT r.operacao_id, r.recurso_catalogo_id, r.indicativo_radio, 'participante'
            FROM recursos r
            WHERE r.operacao_id IS NOT NULL
              AND r.recurso_catalogo_id IS NOT NULL
            ON CONFLICT (operacao_id, recurso_catalogo_id) DO NOTHING
        """))

        # Materializa no Centro de Operações todos os recursos já preparados.
        # Quando ainda não existe posição guardada, usa um ponto inicial aproximado da ilha.
        conn.execute(text("""
            INSERT INTO recursos (
                nome, tipo, estado, indicativo_radio, ilha, localizacao,
                operacao_id, recurso_catalogo_id
            )
            SELECT
                rc.nome, rc.tipo, 'disponivel', opr.indicativo_operacional, rc.ilha,
                COALESCE(
                    (SELECT r2.localizacao
                     FROM recursos r2
                     WHERE r2.recurso_catalogo_id = rc.id
                       AND r2.localizacao IS NOT NULL
                     ORDER BY r2.criado_em DESC NULLS LAST, r2.id DESC
                     LIMIT 1),
                    ST_SetSRID(ST_MakePoint(
                        CASE LOWER(COALESCE(rc.ilha, ''))
                            WHEN 'são miguel' THEN -25.50
                            WHEN 'sao miguel' THEN -25.50
                            WHEN 'santa maria' THEN -25.10
                            WHEN 'terceira' THEN -27.22
                            WHEN 'graciosa' THEN -28.02
                            WHEN 'são jorge' THEN -28.05
                            WHEN 'sao jorge' THEN -28.05
                            WHEN 'pico' THEN -28.32
                            WHEN 'faial' THEN -28.63
                            WHEN 'flores' THEN -31.20
                            WHEN 'corvo' THEN -31.11
                            ELSE -27.22
                        END,
                        CASE LOWER(COALESCE(rc.ilha, ''))
                            WHEN 'são miguel' THEN 37.78
                            WHEN 'sao miguel' THEN 37.78
                            WHEN 'santa maria' THEN 36.97
                            WHEN 'terceira' THEN 38.66
                            WHEN 'graciosa' THEN 39.05
                            WHEN 'são jorge' THEN 38.65
                            WHEN 'sao jorge' THEN 38.65
                            WHEN 'pico' THEN 38.47
                            WHEN 'faial' THEN 38.58
                            WHEN 'flores' THEN 39.45
                            WHEN 'corvo' THEN 39.70
                            ELSE 38.66
                        END
                    ), 4326)
                ),
                opr.operacao_id, rc.id
            FROM operacao_recursos opr
            JOIN recursos_catalogo rc ON rc.id = opr.recurso_catalogo_id
            WHERE opr.saida_em IS NULL
              AND opr.estado = 'participante'
              AND NOT EXISTS (
                  SELECT 1 FROM recursos r3
                  WHERE r3.operacao_id = opr.operacao_id
                    AND r3.recurso_catalogo_id = rc.id
              )
        """))
        conn.execute(text("""
            UPDATE recursos r
            SET nome = rc.nome,
                tipo = rc.tipo,
                indicativo_radio = opr.indicativo_operacional,
                ilha = rc.ilha
            FROM operacao_recursos opr
            JOIN recursos_catalogo rc ON rc.id = opr.recurso_catalogo_id
            WHERE r.operacao_id = opr.operacao_id
              AND r.recurso_catalogo_id = rc.id
              AND opr.saida_em IS NULL
              AND opr.estado = 'participante'
        """))

        total_antigos = conn.execute(text("""
            SELECT
              (SELECT COUNT(*) FROM recursos WHERE operacao_id IS NULL) +
              (SELECT COUNT(*) FROM ocorrencias WHERE operacao_id IS NULL) +
              (SELECT COUNT(*) FROM missoes WHERE operacao_id IS NULL) +
              (SELECT COUNT(*) FROM ordens WHERE operacao_id IS NULL) +
              (SELECT COUNT(*) FROM timeline_eventos WHERE operacao_id IS NULL) +
              (SELECT COUNT(*) FROM elementos WHERE operacao_id IS NULL)
        """)).scalar() or 0

        if total_antigos > 0:
            legado_id = conn.execute(text("""
                SELECT id FROM operacoes
                WHERE nome = 'Dados anteriores ao SGO 2.0'
                ORDER BY id LIMIT 1
            """)).scalar()
            if legado_id is None:
                legado_id = conn.execute(text("""
                    INSERT INTO operacoes (nome, tipo, descricao, estado)
                    VALUES ('Dados anteriores ao SGO 2.0', 'Arquivo',
                            'Dados criados antes da separação por operações.', 'arquivada')
                    RETURNING id
                """)).scalar_one()
            for tabela in ("recursos", "ocorrencias", "missoes", "ordens", "timeline_eventos", "elementos"):
                conn.execute(text(f"UPDATE {tabela} SET operacao_id = :id WHERE operacao_id IS NULL"), {"id": legado_id})

            conn.execute(text("""
                INSERT INTO operacao_recursos (
                    operacao_id, recurso_catalogo_id, indicativo_operacional, estado
                )
                SELECT DISTINCT r.operacao_id, r.recurso_catalogo_id, r.indicativo_radio, 'participante'
                FROM recursos r
                WHERE r.operacao_id = :legado_id
                  AND r.recurso_catalogo_id IS NOT NULL
                ON CONFLICT (operacao_id, recurso_catalogo_id) DO NOTHING
            """), {"legado_id": legado_id})


@app.on_event("startup")
def iniciar_estrutura_operacoes():
    preparar_separacao_por_operacao()


@app.get("/operacoes")
def listar_operacoes():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT
                id, nome, tipo, entidade_organizadora, local, objetivo,
                descricao, estado, data_inicio, data_fim, criado_em
            FROM operacoes
            WHERE COALESCE(estado, '') <> 'arquivada'
            ORDER BY criado_em DESC
        """))
        return [dict(linha._mapping) for linha in resultado]


@app.post("/operacoes")
def criar_operacao(operacao: Operacao):
    with engine.begin() as conn:
        nova = conn.execute(
            text("""
                INSERT INTO operacoes (
                    nome, tipo, entidade_organizadora, local, objetivo,
                    descricao, estado, data_inicio, data_fim
                )
                VALUES (
                    :nome, :tipo, :entidade_organizadora, :local, :objetivo,
                    :descricao, 'planeada', :data_inicio, :data_fim
                )
                RETURNING
                    id, nome, tipo, entidade_organizadora, local, objetivo,
                    descricao, estado, data_inicio, data_fim, criado_em
            """),
            operacao.model_dump()
        ).mappings().fetchone()

        return dict(nova)


@app.get("/operacao-ativa")
def obter_operacao_ativa():
    with engine.connect() as conn:
        operacao = conn.execute(text("""
            SELECT o.*
            FROM configuracao c
            JOIN operacoes o ON o.id = CAST(c.valor AS INTEGER)
            WHERE c.chave = 'operacao_ativa'
              AND c.valor IS NOT NULL
              AND c.valor <> ''
        """)).mappings().fetchone()

        return dict(operacao) if operacao else None


@app.post("/operacoes/{operacao_id}/ativar")
def ativar_operacao(operacao_id: int):
    with engine.begin() as conn:
        operacao = conn.execute(
            text("SELECT id, nome, estado FROM operacoes WHERE id = :id"),
            {"id": operacao_id}
        ).fetchone()

        if not operacao:
            raise HTTPException(status_code=404, detail="Operação não encontrada")

        if operacao[2] == "arquivada":
            raise HTTPException(status_code=409, detail="Restaure a operação antes de a abrir")

        conn.execute(text("""
            INSERT INTO configuracao (chave, valor)
            VALUES ('operacao_ativa', :valor)
            ON CONFLICT (chave)
            DO UPDATE SET valor = EXCLUDED.valor
        """), {"valor": str(operacao_id)})

        return {
            "mensagem": "Operação ativada",
            "operacao_id": operacao_id,
            "nome": operacao[1]
        }


@app.get("/operacoes/arquivadas")
def listar_operacoes_arquivadas():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT
                id, nome, tipo, entidade_organizadora, local, objetivo,
                descricao, estado, data_inicio, data_fim, criado_em
            FROM operacoes
            WHERE estado = 'arquivada'
            ORDER BY criado_em DESC
        """))
        return [dict(linha._mapping) for linha in resultado]


@app.delete("/operacoes/{operacao_id}")
def eliminar_operacao(operacao_id: int, dados: ConfirmacaoEliminacao):
    if dados.confirmacao.strip().upper() != "ELIMINAR":
        raise HTTPException(
            status_code=400,
            detail="Confirmação inválida. Escreva ELIMINAR."
        )

    with engine.begin() as conn:
        operacao = conn.execute(
            text("SELECT id, nome, estado FROM operacoes WHERE id = :id"),
            {"id": operacao_id}
        ).fetchone()

        if not operacao:
            raise HTTPException(status_code=404, detail="Operação não encontrada")

        if operacao[2] != "arquivada":
            raise HTTPException(
                status_code=409,
                detail="Apenas operações arquivadas podem ser eliminadas"
            )

        operacao_ativa_id = obter_operacao_ativa_id(conn)
        if operacao_ativa_id == operacao_id:
            raise HTTPException(
                status_code=409,
                detail="A operação ativa não pode ser eliminada"
            )

        # Apagar primeiro os registos dependentes, preservando as outras operações.
        contagens = {}
        for tabela in (
            "timeline_eventos",
            "ordens",
            "missoes",
            "elementos",
            "recursos",
            "ocorrencias",
        ):
            resultado = conn.execute(
                text(f"DELETE FROM {tabela} WHERE operacao_id = :id"),
                {"id": operacao_id}
            )
            contagens[tabela] = resultado.rowcount

        conn.execute(
            text("DELETE FROM operacoes WHERE id = :id"),
            {"id": operacao_id}
        )

        return {
            "mensagem": "Operação eliminada definitivamente",
            "operacao_id": operacao_id,
            "nome": operacao[1],
            "registos_eliminados": contagens
        }


@app.put("/operacoes/{operacao_id}/restaurar")
def restaurar_operacao(operacao_id: int):
    with engine.begin() as conn:
        operacao = conn.execute(
            text("SELECT id, nome, estado FROM operacoes WHERE id = :id"),
            {"id": operacao_id}
        ).fetchone()

        if not operacao:
            raise HTTPException(status_code=404, detail="Operação não encontrada")

        if operacao[2] != 'arquivada':
            raise HTTPException(status_code=409, detail="A operação não está arquivada")

        conn.execute(
            text("UPDATE operacoes SET estado = 'planeada' WHERE id = :id"),
            {"id": operacao_id}
        )

        return {
            "mensagem": "Operação restaurada",
            "operacao_id": operacao_id,
            "nome": operacao[1]
        }


@app.put("/operacoes/{operacao_id}/encerrar")
def encerrar_operacao(operacao_id: int):
    with engine.begin() as conn:
        operacao = conn.execute(text("SELECT id, nome, estado FROM operacoes WHERE id = :id"), {"id": operacao_id}).fetchone()
        if not operacao:
            raise HTTPException(status_code=404, detail="Operação não encontrada")
        if operacao[2] == "arquivada":
            raise HTTPException(status_code=409, detail="Uma operação arquivada não pode ser encerrada")
        conn.execute(text("UPDATE operacoes SET estado = 'concluida', data_fim = NOW() WHERE id = :id"), {"id": operacao_id})
        return {"mensagem": "Operação encerrada", "operacao_id": operacao_id, "nome": operacao[1]}


@app.put("/operacoes/{operacao_id}/reabrir")
def reabrir_operacao(operacao_id: int):
    with engine.begin() as conn:
        operacao = conn.execute(text("SELECT id, nome, estado FROM operacoes WHERE id = :id"), {"id": operacao_id}).fetchone()
        if not operacao:
            raise HTTPException(status_code=404, detail="Operação não encontrada")
        if operacao[2] != "concluida":
            raise HTTPException(status_code=409, detail="A operação não está concluída")
        conn.execute(text("UPDATE operacoes SET estado = 'planeada', data_fim = NULL WHERE id = :id"), {"id": operacao_id})
        return {"mensagem": "Operação reaberta", "operacao_id": operacao_id, "nome": operacao[1]}


@app.put("/operacoes/{operacao_id}/arquivar")
def arquivar_operacao(operacao_id: int):
    with engine.begin() as conn:
        operacao = conn.execute(
            text("SELECT id, nome, estado FROM operacoes WHERE id = :id"),
            {"id": operacao_id}
        ).fetchone()

        if not operacao:
            raise HTTPException(status_code=404, detail="Operação não encontrada")

        operacao_ativa_id = obter_operacao_ativa_id(conn)
        if operacao_ativa_id == operacao_id:
            raise HTTPException(
                status_code=409,
                detail="Feche a operação antes de a arquivar"
            )

        conn.execute(
            text("UPDATE operacoes SET estado = 'arquivada' WHERE id = :id"),
            {"id": operacao_id}
        )

        return {
            "mensagem": "Operação arquivada",
            "operacao_id": operacao_id,
            "nome": operacao[1]
        }


@app.delete("/operacao-ativa")
def desativar_operacao():
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO configuracao (chave, valor)
            VALUES ('operacao_ativa', NULL)
            ON CONFLICT (chave)
            DO UPDATE SET valor = NULL
        """))

    return {"mensagem": "Operação fechada"}

@app.get("/catalogo-recursos")
def listar_catalogo_recursos():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT rc.id, rc.nome, rc.tipo, rc.entidade_id,
                   e.nome AS entidade_nome, rc.ilha, rc.estado, rc.criado_em
            FROM recursos_catalogo rc
            LEFT JOIN entidades e ON e.id = rc.entidade_id
            WHERE rc.estado = 'ativo'
            ORDER BY rc.nome, rc.tipo
        """))
        return [dict(linha._mapping) for linha in resultado]


@app.post("/catalogo-recursos")
def criar_recurso_catalogo(recurso: RecursoCatalogo):
    with engine.begin() as conn:
        novo = conn.execute(text("""
            INSERT INTO recursos_catalogo (nome, tipo, entidade_id, ilha, estado)
            VALUES (:nome, :tipo, :entidade_id, :ilha, :estado)
            ON CONFLICT (nome, tipo) DO UPDATE SET
                entidade_id = COALESCE(EXCLUDED.entidade_id, recursos_catalogo.entidade_id),
                ilha = COALESCE(EXCLUDED.ilha, recursos_catalogo.ilha),
                estado = 'ativo'
            RETURNING id, nome, tipo, entidade_id, ilha, estado, criado_em
        """), recurso.model_dump()).mappings().fetchone()
        return dict(novo)


@app.get("/operacoes/{operacao_id}/recursos-participantes")
def listar_recursos_participantes(operacao_id: int):
    with engine.connect() as conn:
        existe = conn.execute(text("SELECT id FROM operacoes WHERE id=:id"), {"id": operacao_id}).scalar()
        if not existe:
            raise HTTPException(status_code=404, detail="Operação não encontrada")
        resultado = conn.execute(text("""
            SELECT opr.id AS participacao_id, opr.operacao_id,
                   rc.id AS recurso_catalogo_id, rc.nome, rc.tipo, rc.ilha,
                   rc.entidade_id, e.nome AS entidade_nome,
                   opr.indicativo_operacional, opr.funcao, opr.estado,
                   opr.entrada_em, opr.saida_em
            FROM operacao_recursos opr
            JOIN recursos_catalogo rc ON rc.id = opr.recurso_catalogo_id
            LEFT JOIN entidades e ON e.id = rc.entidade_id
            WHERE opr.operacao_id = :operacao_id
              AND opr.saida_em IS NULL
            ORDER BY rc.nome, rc.tipo
        """), {"operacao_id": operacao_id})
        return [dict(linha._mapping) for linha in resultado]


@app.post("/operacoes/{operacao_id}/recursos-participantes")
def adicionar_recurso_participante(operacao_id: int, dados: ParticipacaoRecurso):
    with engine.begin() as conn:
        operacao = conn.execute(text("SELECT estado FROM operacoes WHERE id=:id"), {"id": operacao_id}).scalar()
        if operacao is None:
            raise HTTPException(status_code=404, detail="Operação não encontrada")
        if operacao in ("concluida", "arquivada"):
            raise HTTPException(status_code=409, detail="A operação não permite alterar participantes")
        recurso = conn.execute(text("SELECT id FROM recursos_catalogo WHERE id=:id AND estado='ativo'"), {"id": dados.recurso_catalogo_id}).scalar()
        if recurso is None:
            raise HTTPException(status_code=404, detail="Recurso não encontrado no catálogo")
        participacao = conn.execute(text("""
            INSERT INTO operacao_recursos (
                operacao_id, recurso_catalogo_id, indicativo_operacional, funcao, estado, saida_em
            ) VALUES (
                :operacao_id, :recurso_catalogo_id, :indicativo_operacional, :funcao, 'participante', NULL
            )
            ON CONFLICT (operacao_id, recurso_catalogo_id) DO UPDATE SET
                indicativo_operacional = EXCLUDED.indicativo_operacional,
                funcao = EXCLUDED.funcao,
                estado = 'participante',
                saida_em = NULL
            RETURNING id
        """), {
            "operacao_id": operacao_id,
            **dados.model_dump()
        }).scalar_one()

        # Cria ou atualiza a representação operacional que aparece no mapa.
        conn.execute(text("""
            INSERT INTO recursos (
                nome, tipo, estado, indicativo_radio, ilha, localizacao,
                operacao_id, recurso_catalogo_id
            )
            SELECT
                rc.nome, rc.tipo, 'disponivel', :indicativo_operacional, rc.ilha,
                COALESCE(
                    (SELECT r2.localizacao
                     FROM recursos r2
                     WHERE r2.recurso_catalogo_id = rc.id
                       AND r2.localizacao IS NOT NULL
                     ORDER BY r2.criado_em DESC NULLS LAST, r2.id DESC
                     LIMIT 1),
                    ST_SetSRID(ST_MakePoint(
                        CASE LOWER(COALESCE(rc.ilha, ''))
                            WHEN 'são miguel' THEN -25.50 WHEN 'sao miguel' THEN -25.50
                            WHEN 'santa maria' THEN -25.10 WHEN 'terceira' THEN -27.22
                            WHEN 'graciosa' THEN -28.02 WHEN 'são jorge' THEN -28.05
                            WHEN 'sao jorge' THEN -28.05 WHEN 'pico' THEN -28.32
                            WHEN 'faial' THEN -28.63 WHEN 'flores' THEN -31.20
                            WHEN 'corvo' THEN -31.11 ELSE -27.22 END,
                        CASE LOWER(COALESCE(rc.ilha, ''))
                            WHEN 'são miguel' THEN 37.78 WHEN 'sao miguel' THEN 37.78
                            WHEN 'santa maria' THEN 36.97 WHEN 'terceira' THEN 38.66
                            WHEN 'graciosa' THEN 39.05 WHEN 'são jorge' THEN 38.65
                            WHEN 'sao jorge' THEN 38.65 WHEN 'pico' THEN 38.47
                            WHEN 'faial' THEN 38.58 WHEN 'flores' THEN 39.45
                            WHEN 'corvo' THEN 39.70 ELSE 38.66 END
                    ), 4326)
                ),
                :operacao_id, rc.id
            FROM recursos_catalogo rc
            WHERE rc.id = :recurso_catalogo_id
              AND NOT EXISTS (
                  SELECT 1 FROM recursos r3
                  WHERE r3.operacao_id = :operacao_id
                    AND r3.recurso_catalogo_id = rc.id
              )
        """), {
            "operacao_id": operacao_id,
            "recurso_catalogo_id": dados.recurso_catalogo_id,
            "indicativo_operacional": dados.indicativo_operacional
        })
        conn.execute(text("""
            UPDATE recursos
            SET indicativo_radio = :indicativo_operacional
            WHERE operacao_id = :operacao_id
              AND recurso_catalogo_id = :recurso_catalogo_id
        """), {
            "operacao_id": operacao_id,
            "recurso_catalogo_id": dados.recurso_catalogo_id,
            "indicativo_operacional": dados.indicativo_operacional
        })

        return {"mensagem": "Recurso adicionado à operação", "participacao_id": participacao}


@app.delete("/operacoes/{operacao_id}/recursos-participantes/{recurso_catalogo_id}")
def retirar_recurso_participante(operacao_id: int, recurso_catalogo_id: int):
    with engine.begin() as conn:
        estado = conn.execute(text("SELECT estado FROM operacoes WHERE id=:id"), {"id": operacao_id}).scalar()
        if estado is None:
            raise HTTPException(status_code=404, detail="Operação não encontrada")
        if estado in ("concluida", "arquivada"):
            raise HTTPException(status_code=409, detail="A operação não permite alterar participantes")
        resultado = conn.execute(text("""
            UPDATE operacao_recursos
            SET saida_em = NOW(), estado = 'retirado'
            WHERE operacao_id = :operacao_id
              AND recurso_catalogo_id = :recurso_catalogo_id
              AND saida_em IS NULL
        """), {"operacao_id": operacao_id, "recurso_catalogo_id": recurso_catalogo_id})
        if resultado.rowcount == 0:
            raise HTTPException(status_code=404, detail="Participação não encontrada")

        conn.execute(text("""
            UPDATE operacao_elementos
            SET recurso_catalogo_id = NULL
            WHERE operacao_id = :operacao_id
              AND recurso_catalogo_id = :recurso_catalogo_id
              AND saida_em IS NULL
        """), {"operacao_id": operacao_id, "recurso_catalogo_id": recurso_catalogo_id})

        conn.execute(text("""
            UPDATE elementos
            SET recurso_id = NULL, estado = 'disponivel'
            WHERE operacao_id = :operacao_id
              AND recurso_id IN (
                  SELECT id FROM recursos
                  WHERE operacao_id = :operacao_id
                    AND recurso_catalogo_id = :recurso_catalogo_id
              )
        """), {"operacao_id": operacao_id, "recurso_catalogo_id": recurso_catalogo_id})

        return {"mensagem": "Recurso retirado da operação"}


@app.get("/catalogo-elementos")
def listar_catalogo_elementos():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT id, nome, entidade, estado, criado_em
            FROM elementos_catalogo
            WHERE estado = 'ativo'
            ORDER BY nome, entidade
        """))
        return [dict(linha._mapping) for linha in resultado]


@app.post("/catalogo-elementos")
def criar_elemento_catalogo(elemento: ElementoCatalogo):
    with engine.begin() as conn:
        novo = conn.execute(text("""
            INSERT INTO elementos_catalogo (nome, entidade, estado)
            VALUES (:nome, :entidade, :estado)
            ON CONFLICT (nome, entidade) DO UPDATE SET estado = 'ativo'
            RETURNING id, nome, entidade, estado, criado_em
        """), elemento.model_dump()).mappings().fetchone()
        return dict(novo)


@app.get("/operacoes/{operacao_id}/elementos-participantes")
def listar_elementos_participantes(operacao_id: int):
    with engine.connect() as conn:
        existe = conn.execute(text("SELECT id FROM operacoes WHERE id=:id"), {"id": operacao_id}).scalar()
        if not existe:
            raise HTTPException(status_code=404, detail="Operação não encontrada")
        resultado = conn.execute(text("""
            SELECT ope.id AS participacao_id, ope.operacao_id,
                   ec.id AS elemento_catalogo_id, ec.nome, ec.entidade,
                   ope.indicativo_operacional, ope.funcao_operacional,
                   ope.recurso_catalogo_id, rc.nome AS recurso_nome,
                   rc.tipo AS recurso_tipo, opr.indicativo_operacional AS recurso_indicativo,
                   ope.estado, ope.entrada_em, ope.saida_em
            FROM operacao_elementos ope
            JOIN elementos_catalogo ec ON ec.id = ope.elemento_catalogo_id
            LEFT JOIN recursos_catalogo rc ON rc.id = ope.recurso_catalogo_id
            LEFT JOIN operacao_recursos opr
              ON opr.operacao_id = ope.operacao_id
             AND opr.recurso_catalogo_id = ope.recurso_catalogo_id
             AND opr.saida_em IS NULL
            WHERE ope.operacao_id = :operacao_id
              AND ope.saida_em IS NULL
            ORDER BY ec.nome, ec.entidade
        """), {"operacao_id": operacao_id})
        return [dict(linha._mapping) for linha in resultado]


@app.post("/operacoes/{operacao_id}/elementos-participantes")
def adicionar_elemento_participante(operacao_id: int, dados: ParticipacaoElemento):
    with engine.begin() as conn:
        estado_operacao = conn.execute(text("SELECT estado FROM operacoes WHERE id=:id"), {"id": operacao_id}).scalar()
        if estado_operacao is None:
            raise HTTPException(status_code=404, detail="Operação não encontrada")
        if estado_operacao in ("concluida", "arquivada"):
            raise HTTPException(status_code=409, detail="A operação não permite alterar participantes")

        elemento = conn.execute(text("SELECT id FROM elementos_catalogo WHERE id=:id AND estado='ativo'"), {"id": dados.elemento_catalogo_id}).scalar()
        if elemento is None:
            raise HTTPException(status_code=404, detail="Elemento não encontrado no catálogo")

        if dados.recurso_catalogo_id is not None:
            recurso_participante = conn.execute(text("""
                SELECT 1 FROM operacao_recursos
                WHERE operacao_id = :operacao_id
                  AND recurso_catalogo_id = :recurso_catalogo_id
                  AND estado = 'participante'
                  AND saida_em IS NULL
            """), {
                "operacao_id": operacao_id,
                "recurso_catalogo_id": dados.recurso_catalogo_id
            }).scalar()
            if not recurso_participante:
                raise HTTPException(status_code=409, detail="A viatura selecionada não participa nesta operação")

        conn.execute(text("""
            INSERT INTO operacao_elementos (
                operacao_id, elemento_catalogo_id, indicativo_operacional,
                funcao_operacional, recurso_catalogo_id, estado, saida_em
            ) VALUES (
                :operacao_id, :elemento_catalogo_id, :indicativo_operacional,
                :funcao_operacional, :recurso_catalogo_id, 'participante', NULL
            )
            ON CONFLICT (operacao_id, elemento_catalogo_id) DO UPDATE SET
                indicativo_operacional = EXCLUDED.indicativo_operacional,
                funcao_operacional = EXCLUDED.funcao_operacional,
                recurso_catalogo_id = EXCLUDED.recurso_catalogo_id,
                estado = 'participante',
                saida_em = NULL
        """), {"operacao_id": operacao_id, **dados.model_dump()})

        conn.execute(text("""
            INSERT INTO elementos (
                nome, funcao, entidade, estado, indicativo_radio,
                recurso_id, ocorrencia_id, localizacao, operacao_id, elemento_catalogo_id
            )
            SELECT ec.nome, :funcao_operacional, ec.entidade,
                   CASE WHEN :recurso_catalogo_id IS NULL THEN 'disponivel' ELSE 'embarcado' END,
                   :indicativo_operacional,
                   (SELECT r.id FROM recursos r
                    WHERE r.operacao_id = :operacao_id
                      AND r.recurso_catalogo_id = :recurso_catalogo_id
                    ORDER BY r.id LIMIT 1),
                   NULL, NULL, :operacao_id, ec.id
            FROM elementos_catalogo ec
            WHERE ec.id = :elemento_catalogo_id
              AND NOT EXISTS (
                  SELECT 1 FROM elementos e
                  WHERE e.operacao_id = :operacao_id
                    AND e.elemento_catalogo_id = ec.id
              )
        """), {
            "operacao_id": operacao_id,
            "elemento_catalogo_id": dados.elemento_catalogo_id,
            "indicativo_operacional": dados.indicativo_operacional,
            "funcao_operacional": dados.funcao_operacional,
            "recurso_catalogo_id": dados.recurso_catalogo_id
        })

        conn.execute(text("""
            UPDATE elementos e
            SET nome = ec.nome, entidade = ec.entidade,
                indicativo_radio = ope.indicativo_operacional,
                funcao = ope.funcao_operacional,
                estado = CASE WHEN ope.recurso_catalogo_id IS NULL THEN 'disponivel' ELSE 'embarcado' END,
                recurso_id = (
                    SELECT r.id FROM recursos r
                    WHERE r.operacao_id = ope.operacao_id
                      AND r.recurso_catalogo_id = ope.recurso_catalogo_id
                    ORDER BY r.id LIMIT 1
                )
            FROM operacao_elementos ope
            JOIN elementos_catalogo ec ON ec.id = ope.elemento_catalogo_id
            WHERE e.operacao_id = ope.operacao_id
              AND e.elemento_catalogo_id = ec.id
              AND ope.operacao_id = :operacao_id
              AND ope.elemento_catalogo_id = :elemento_catalogo_id
        """), {"operacao_id": operacao_id, "elemento_catalogo_id": dados.elemento_catalogo_id})

        return {"mensagem": "Elemento adicionado à operação"}


@app.delete("/operacoes/{operacao_id}/elementos-participantes/{elemento_catalogo_id}")
def retirar_elemento_participante(operacao_id: int, elemento_catalogo_id: int):
    with engine.begin() as conn:
        estado_operacao = conn.execute(text("SELECT estado FROM operacoes WHERE id=:id"), {"id": operacao_id}).scalar()
        if estado_operacao is None:
            raise HTTPException(status_code=404, detail="Operação não encontrada")
        if estado_operacao in ("concluida", "arquivada"):
            raise HTTPException(status_code=409, detail="A operação não permite alterar participantes")

        resultado = conn.execute(text("""
            UPDATE operacao_elementos
            SET estado = 'retirado', saida_em = NOW()
            WHERE operacao_id = :operacao_id
              AND elemento_catalogo_id = :elemento_catalogo_id
              AND saida_em IS NULL
        """), {"operacao_id": operacao_id, "elemento_catalogo_id": elemento_catalogo_id})
        if resultado.rowcount == 0:
            raise HTTPException(status_code=404, detail="Participação não encontrada")

        conn.execute(text("""
            DELETE FROM elementos
            WHERE operacao_id = :operacao_id
              AND elemento_catalogo_id = :elemento_catalogo_id
        """), {"operacao_id": operacao_id, "elemento_catalogo_id": elemento_catalogo_id})
        return {"mensagem": "Elemento retirado da operação"}


@app.get("/recursos")
def listar_recursos():
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        resultado = conn.execute(text("""
            SELECT
                r.id,
                r.nome,
                r.tipo,
                r.estado,
                COALESCE(opr.indicativo_operacional, r.indicativo_radio) AS indicativo_radio,
                r.ilha,
                r.ocorrencia_id,
                ST_Y(r.localizacao) AS latitude,
                ST_X(r.localizacao) AS longitude,
                r.criado_em,
                r.recurso_catalogo_id,
                opr.funcao AS funcao_operacional
            FROM recursos r
            JOIN operacao_recursos opr
              ON opr.operacao_id = r.operacao_id
             AND opr.recurso_catalogo_id = r.recurso_catalogo_id
             AND opr.estado = 'participante'
             AND opr.saida_em IS NULL
            WHERE r.operacao_id = :operacao_id
            ORDER BY r.nome, r.tipo
        """), {"operacao_id": operacao_id})
        return [dict(linha._mapping) for linha in resultado]


@app.post("/recursos")
def criar_recurso(recurso: Recurso):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)

        catalogo_id = conn.execute(text("""
            INSERT INTO recursos_catalogo (nome, tipo, ilha, estado)
            VALUES (:nome, :tipo, :ilha, 'ativo')
            ON CONFLICT (nome, tipo) DO UPDATE SET
                ilha = COALESCE(EXCLUDED.ilha, recursos_catalogo.ilha),
                estado = 'ativo'
            RETURNING id
        """), {
            "nome": recurso.nome,
            "tipo": recurso.tipo,
            "ilha": recurso.ilha
        }).scalar_one()

        conn.execute(text("""
            INSERT INTO operacao_recursos (
                operacao_id, recurso_catalogo_id, indicativo_operacional, estado, saida_em
            ) VALUES (
                :operacao_id, :catalogo_id, :indicativo, 'participante', NULL
            )
            ON CONFLICT (operacao_id, recurso_catalogo_id) DO UPDATE SET
                indicativo_operacional = EXCLUDED.indicativo_operacional,
                estado = 'participante',
                saida_em = NULL
        """), {
            "operacao_id": operacao_id,
            "catalogo_id": catalogo_id,
            "indicativo": recurso.indicativo_radio
        })

        recurso_operacional_id = conn.execute(text("""
            SELECT id FROM recursos
            WHERE operacao_id = :operacao_id
              AND recurso_catalogo_id = :catalogo_id
            ORDER BY id LIMIT 1
        """), {"operacao_id": operacao_id, "catalogo_id": catalogo_id}).scalar()

        parametros_recurso = {
            "nome": recurso.nome,
            "tipo": recurso.tipo,
            "estado": recurso.estado,
            "indicativo_radio": recurso.indicativo_radio,
            "ilha": recurso.ilha,
            "latitude": recurso.latitude,
            "longitude": recurso.longitude,
            "operacao_id": operacao_id,
            "catalogo_id": catalogo_id
        }
        if recurso_operacional_id is None:
            conn.execute(text("""
                INSERT INTO recursos (
                    nome, tipo, estado, indicativo_radio, ilha, localizacao,
                    operacao_id, recurso_catalogo_id
                ) VALUES (
                    :nome, :tipo, :estado, :indicativo_radio, :ilha,
                    ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
                    :operacao_id, :catalogo_id
                )
            """), parametros_recurso)
        else:
            conn.execute(text("""
                UPDATE recursos
                SET nome = :nome, tipo = :tipo, estado = :estado,
                    indicativo_radio = :indicativo_radio, ilha = :ilha,
                    localizacao = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
                WHERE id = :id
            """), {**parametros_recurso, "id": recurso_operacional_id})

        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id)
            VALUES ('recurso', :descricao, :operacao_id)
        """), {
            "descricao": f"Recurso preparado/adicionado: {recurso.nome} ({recurso.tipo})",
            "operacao_id": operacao_id
        })

    return {"mensagem": "Recurso criado e adicionado à operação"}


@app.get("/ocorrencias")
def listar_ocorrencias():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT
                id, titulo, descricao, tipo, estado, ilha,
                ST_Y(localizacao) AS latitude,
                ST_X(localizacao) AS longitude,
                criado_em, recebida_em, despachada_em, em_curso_em,
                sob_controlo_em, encerrada_em, arquivada_em
            FROM ocorrencias
            WHERE operacao_id = :operacao_id
            ORDER BY criado_em DESC
        """), {"operacao_id": exigir_operacao_ativa_id(conn)})
        return [dict(linha._mapping) for linha in resultado]


@app.post("/ocorrencias")
def criar_ocorrencia(ocorrencia: Ocorrencia):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        nova = conn.execute(text("""
            INSERT INTO ocorrencias (
                titulo, descricao, tipo, estado, ilha, localizacao,
                operacao_id, recebida_em
            ) VALUES (
                :titulo, :descricao, :tipo, 'recebida', :ilha,
                ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
                :operacao_id, NOW()
            )
            RETURNING id
        """), {
            "titulo": ocorrencia.titulo,
            "descricao": ocorrencia.descricao,
            "tipo": ocorrencia.tipo,
            "ilha": ocorrencia.ilha,
            "latitude": ocorrencia.latitude,
            "longitude": ocorrencia.longitude,
            "operacao_id": operacao_id
        }).scalar()
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, ocorrencia_id, operacao_id)
            VALUES ('ocorrencia', :descricao, :ocorrencia_id, :operacao_id)
        """), {
            "descricao": f"Ocorrência recebida: {ocorrencia.titulo}",
            "ocorrencia_id": nova,
            "operacao_id": operacao_id
        })
    return {"mensagem": "Ocorrência criada com sucesso", "id": nova}


ESTADOS_OCORRENCIA = ["recebida", "despachada", "em_curso", "sob_controlo", "encerrada", "arquivada"]
COLUNA_HORA_ESTADO = {
    "recebida": "recebida_em",
    "despachada": "despachada_em",
    "em_curso": "em_curso_em",
    "sob_controlo": "sob_controlo_em",
    "encerrada": "encerrada_em",
    "arquivada": "arquivada_em",
}
ROTULO_ESTADO = {
    "recebida": "Recebida",
    "despachada": "Despachada",
    "em_curso": "Em curso",
    "sob_controlo": "Sob controlo",
    "encerrada": "Encerrada",
    "arquivada": "Arquivada",
}


def atualizar_estado_ocorrencia_interno(conn, ocorrencia_id: int, novo_estado: str, operacao_id: int):
    if novo_estado not in ESTADOS_OCORRENCIA:
        raise HTTPException(status_code=400, detail="Estado de ocorrência inválido")
    atual = conn.execute(text("""
        SELECT titulo, estado FROM ocorrencias
        WHERE id=:id AND operacao_id=:operacao_id
    """), {"id": ocorrencia_id, "operacao_id": operacao_id}).fetchone()
    if not atual:
        raise HTTPException(status_code=404, detail="Ocorrência não encontrada")
    if atual.estado == novo_estado:
        return
    coluna = COLUNA_HORA_ESTADO[novo_estado]
    conn.execute(text(f"""
        UPDATE ocorrencias
        SET estado=:estado, {coluna}=COALESCE({coluna}, NOW())
        WHERE id=:id AND operacao_id=:operacao_id
    """), {"estado": novo_estado, "id": ocorrencia_id, "operacao_id": operacao_id})
    conn.execute(text("""
        INSERT INTO timeline_eventos (tipo, descricao, ocorrencia_id, operacao_id)
        VALUES ('ocorrencia', :descricao, :ocorrencia_id, :operacao_id)
    """), {
        "descricao": f"Ocorrência {atual.titulo}: estado alterado para {ROTULO_ESTADO[novo_estado]}",
        "ocorrencia_id": ocorrencia_id,
        "operacao_id": operacao_id
    })


@app.put("/ocorrencias/{ocorrencia_id}/estado")
def alterar_estado_ocorrencia(ocorrencia_id: int, dados: EstadoOcorrencia):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        atualizar_estado_ocorrencia_interno(conn, ocorrencia_id, dados.estado, operacao_id)
    return {"mensagem": "Estado da ocorrência atualizado"}


@app.get("/ocorrencias/{ocorrencia_id}/timeline")
def timeline_ocorrencia(ocorrencia_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        resultado = conn.execute(text("""
            SELECT id, tipo, descricao, recurso_id, ocorrencia_id, criado_em
            FROM timeline_eventos
            WHERE ocorrencia_id=:ocorrencia_id AND operacao_id=:operacao_id
            ORDER BY criado_em DESC
        """), {"ocorrencia_id": ocorrencia_id, "operacao_id": operacao_id})
        return [dict(linha._mapping) for linha in resultado]


@app.get("/ocorrencias/{ocorrencia_id}/estatisticas")
def estatisticas_ocorrencia(ocorrencia_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        o = conn.execute(text("""
            SELECT id, titulo, estado, recebida_em, despachada_em, em_curso_em,
                   sob_controlo_em, encerrada_em, arquivada_em
            FROM ocorrencias WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": ocorrencia_id, "operacao_id": operacao_id}).fetchone()
        if not o:
            raise HTTPException(status_code=404, detail="Ocorrência não encontrada")
        recursos = conn.execute(text("""
            SELECT COUNT(DISTINCT recurso_id) FROM timeline_eventos
            WHERE ocorrencia_id=:id AND operacao_id=:operacao_id AND recurso_id IS NOT NULL
        """), {"id": ocorrencia_id, "operacao_id": operacao_id}).scalar() or 0
        recursos_atuais = conn.execute(text("""
            SELECT COUNT(*) FROM recursos
            WHERE ocorrencia_id=:id AND operacao_id=:operacao_id
        """), {"id": ocorrencia_id, "operacao_id": operacao_id}).scalar() or 0
        elementos = conn.execute(text("""
            SELECT COUNT(DISTINCT e.id)
            FROM elementos e
            JOIN recursos r ON r.id=e.recurso_id
            WHERE r.ocorrencia_id=:id AND r.operacao_id=:operacao_id
        """), {"id": ocorrencia_id, "operacao_id": operacao_id}).scalar() or 0
        ordens = conn.execute(text("""
            SELECT COUNT(*) FROM ordens
            WHERE ocorrencia_id=:id AND operacao_id=:operacao_id
        """), {"id": ocorrencia_id, "operacao_id": operacao_id}).scalar() or 0
        primeira_chegada = conn.execute(text("""
            SELECT MIN(criado_em) FROM timeline_eventos
            WHERE ocorrencia_id=:id AND operacao_id=:operacao_id AND tipo='chegada'
        """), {"id": ocorrencia_id, "operacao_id": operacao_id}).scalar()
        def segundos(a, b):
            return int((b-a).total_seconds()) if a and b else None
        recebida = o.recebida_em
        fim = o.encerrada_em or datetime.now()
        return {
            "ocorrencia_id": o.id,
            "titulo": o.titulo,
            "estado": o.estado,
            "recebida_em": recebida,
            "despachada_em": o.despachada_em,
            "primeira_chegada_em": primeira_chegada,
            "em_curso_em": o.em_curso_em,
            "sob_controlo_em": o.sob_controlo_em,
            "encerrada_em": o.encerrada_em,
            "tempo_ate_despacho_segundos": segundos(recebida, o.despachada_em),
            "tempo_resposta_segundos": segundos(o.despachada_em, primeira_chegada),
            "tempo_total_segundos": segundos(recebida, fim),
            "recursos_envolvidos": max(recursos, recursos_atuais),
            "recursos_atuais": recursos_atuais,
            "elementos_atuais": elementos,
            "ordens_emitidas": ordens,
        }


@app.get("/timeline")
def listar_timeline():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT id, tipo, descricao, criado_em
            FROM timeline_eventos
            WHERE operacao_id = :operacao_id
            ORDER BY criado_em DESC
        """), {"operacao_id": exigir_operacao_ativa_id(conn)})

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
                INSERT INTO timeline_eventos (tipo, descricao, operacao_id)
                VALUES ('estado', :descricao, (SELECT CAST(valor AS INTEGER) FROM configuracao WHERE chave='operacao_ativa'))
            """),
            {
                "descricao": f"Recurso {recurso_id} mudou estado para {dados['estado']}"
            }
        )

        conn.commit()

    return {"mensagem": "Estado atualizado"}

@app.put("/recursos/{recurso_id}/libertar")
def libertar_recurso(recurso_id: int):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        recurso = conn.execute(text("""
            SELECT nome, indicativo_radio, ocorrencia_id
            FROM recursos
            WHERE id = :recurso_id AND operacao_id = :operacao_id
        """), {"recurso_id": recurso_id, "operacao_id": operacao_id}).fetchone()
        if not recurso:
            raise HTTPException(status_code=404, detail="Recurso não encontrado nesta operação")

        conn.execute(text("""
            UPDATE recursos
            SET estado = 'disponivel', ocorrencia_id = NULL
            WHERE id = :recurso_id AND operacao_id = :operacao_id
        """), {"recurso_id": recurso_id, "operacao_id": operacao_id})

        conn.execute(text("""
            UPDATE missoes
            SET recurso_id = NULL
            WHERE recurso_id = :recurso_id
              AND operacao_id = :operacao_id
              AND estado <> 'concluida'
        """), {"recurso_id": recurso_id, "operacao_id": operacao_id})

        nome = recurso[1] or recurso[0]
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, recurso_id, operacao_id)
            VALUES ('recurso', :descricao, :recurso_id, :operacao_id)
        """), {
            "descricao": f"Recurso libertado: {nome}",
            "recurso_id": recurso_id,
            "operacao_id": operacao_id
        })

    return {"ok": True, "mensagem": "Recurso libertado"}


@app.put("/recursos/{recurso_id}/posicao")
def atualizar_posicao(recurso_id: int, dados: dict):
    with engine.begin() as conn:
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

        recurso = conn.execute(
            text("""
                SELECT r.nome, r.indicativo_radio, r.ocorrencia_id, o.titulo
                FROM recursos r
                LEFT JOIN ocorrencias o ON o.id = r.ocorrencia_id
                WHERE r.id = :id
            """),
            {"id": recurso_id}
        ).fetchone()

        if recurso and recurso[2]:
            chegou = conn.execute(
                text("""
                    SELECT ST_DWithin(
                        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
                        o.localizacao::geography,
                        100
                    )
                    FROM ocorrencias o
                    WHERE o.id = :ocorrencia_id
                """),
                {
                    "latitude": dados["latitude"],
                    "longitude": dados["longitude"],
                    "ocorrencia_id": recurso[2]
                }
            ).scalar()

            if chegou:
                nome_recurso = recurso[0]
                indicativo = recurso[1] or ""
                ocorrencia_id = recurso[2]
                titulo_ocorrencia = recurso[3]

                texto_recurso = f"{nome_recurso} ({indicativo})" if indicativo else nome_recurso
                hora = agora_acores()

                conn.execute(
                    text("""
                        UPDATE ordens
                        SET estado = 'executada'
                        WHERE recurso_id = :recurso_id
                        AND ocorrencia_id = :ocorrencia_id
                        AND estado = 'emitida'
                    """),
                    {
                        "recurso_id": recurso_id,
                        "ocorrencia_id": ocorrencia_id
                    }
                )
            else:
                conn.execute(
                    text("""
                        INSERT INTO timeline_eventos (tipo, descricao, recurso_id, ocorrencia_id, operacao_id)
                        VALUES ('movimento', :descricao, :recurso_id, :ocorrencia_id, (SELECT CAST(valor AS INTEGER) FROM configuracao WHERE chave='operacao_ativa'))
                    """),
                    {
                        "descricao": f"Recurso {recurso_id} movido",
                        "recurso_id": recurso_id,
                        "ocorrencia_id": recurso[2]
                    }
                )

    return {"mensagem": "Posição atualizada"}

@app.put("/recursos/{recurso_id}/confirmar-chegada")
def confirmar_chegada(recurso_id: int):
    with engine.begin() as conn:
        recurso = conn.execute(
            text("""
                SELECT r.nome, r.indicativo_radio, r.ocorrencia_id, o.titulo
                FROM recursos r
                LEFT JOIN ocorrencias o ON o.id = r.ocorrencia_id
                WHERE r.id = :id
            """),
            {"id": recurso_id}
        ).fetchone()

        if not recurso:
            return {"erro": "Recurso não encontrado"}

        nome_recurso = recurso[0]
        indicativo = recurso[1] or ""
        ocorrencia_id = recurso[2]
        titulo_ocorrencia = recurso[3]

        if not ocorrencia_id:
            return {"erro": "Recurso não tem ocorrência associada"}

        texto_recurso = f"{nome_recurso} ({indicativo})" if indicativo else nome_recurso

        chegada_existente = conn.execute(
            text("""
                SELECT id
                FROM timeline_eventos
                WHERE tipo = 'chegada'
                AND recurso_id = :recurso_id
                AND ocorrencia_id = :ocorrencia_id
                LIMIT 1
            """),
            {
                "recurso_id": recurso_id,
                "ocorrencia_id": ocorrencia_id
            }
        ).fetchone()

        if chegada_existente:
            return {"mensagem": "Chegada já registada"}

        conn.execute(
            text("""
                INSERT INTO timeline_eventos (tipo, descricao, recurso_id, ocorrencia_id, operacao_id)
                VALUES ('chegada', :descricao, :recurso_id, :ocorrencia_id, (SELECT CAST(valor AS INTEGER) FROM configuracao WHERE chave='operacao_ativa'))
            """),
            {
                "descricao": f"Chegada ao local: {texto_recurso} chegou à ocorrência {titulo_ocorrencia}",
                "recurso_id": recurso_id,
                "ocorrencia_id": ocorrencia_id
            }
        )

        estado_ocorrencia = conn.execute(text("SELECT estado FROM ocorrencias WHERE id=:id"), {"id": ocorrencia_id}).scalar()
        if estado_ocorrencia in ("recebida", "despachada"):
            atualizar_estado_ocorrencia_interno(
                conn, ocorrencia_id, "em_curso", exigir_operacao_ativa_id(conn)
            )

        conn.execute(
            text("""
                UPDATE ordens
                SET estado = 'executada'
                WHERE recurso_id = :recurso_id
                AND ocorrencia_id = :ocorrencia_id
                AND estado = 'emitida'
            """),
            {
                "recurso_id": recurso_id,
                "ocorrencia_id": ocorrencia_id
            }
        )

    return {"mensagem": "Chegada registada"}

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
    print(">>> ENTROU NA FUNÇÃO ATRIBUIR_OCORRENCIA")
    try:
        with engine.begin() as conn:
            recurso = conn.execute(
                text("SELECT nome, indicativo_radio FROM recursos WHERE id = :id"),
                {"id": recurso_id}
            ).fetchone()

            ocorrencia = conn.execute(
                text("SELECT titulo FROM ocorrencias WHERE id = :id"),
                {"id": ocorrencia_id}
            ).fetchone()

            nome_recurso = recurso[0] if recurso else f"Recurso {recurso_id}"
            indicativo = recurso[1] if recurso and recurso[1] else ""
            titulo_ocorrencia = ocorrencia[0] if ocorrencia else f"Ocorrência {ocorrencia_id}"

            texto_recurso = f"{nome_recurso} ({indicativo})" if indicativo else nome_recurso
            hora = agora_acores()

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

            estado_ocorrencia = conn.execute(text("SELECT estado FROM ocorrencias WHERE id=:id"), {"id": ocorrencia_id}).scalar()
            if estado_ocorrencia == "recebida":
                atualizar_estado_ocorrencia_interno(
                    conn, ocorrencia_id, "despachada", exigir_operacao_ativa_id(conn)
                )

            conn.execute(
                text("""
                    INSERT INTO ordens (titulo, descricao, estado, recurso_id, ocorrencia_id, operacao_id)
                    VALUES (:titulo, :descricao, 'emitida', :recurso_id, :ocorrencia_id,
                            (SELECT CAST(valor AS INTEGER) FROM configuracao WHERE chave='operacao_ativa'))
                """),
                {
                    "titulo": "Deslocação para ocorrência",
                    "descricao": f"Ordem direta para {texto_recurso} se deslocar para: {titulo_ocorrencia}",
                    "recurso_id": recurso_id,
                    "ocorrencia_id": ocorrencia_id
                }
            )

            conn.execute(
                text("""
                    INSERT INTO timeline_eventos (tipo, descricao, recurso_id, ocorrencia_id, operacao_id)
                    VALUES ('ordem', :descricao, :recurso_id, :ocorrencia_id, (SELECT CAST(valor AS INTEGER) FROM configuracao WHERE chave='operacao_ativa'))
                """),
                {
                    "descricao": f"Ordem emitida: {texto_recurso} deslocar para {titulo_ocorrencia}",
                    "recurso_id": recurso_id,
                    "ocorrencia_id": ocorrencia_id
                }
            )

        return {"mensagem": "Ordem de deslocação criada"}

    except Exception as e:
        return {"erro": str(e)}
    
@app.get("/ordens")
def listar_ordens():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT id, titulo, descricao, estado, recurso_id, ocorrencia_id, criado_em
            FROM ordens
            WHERE operacao_id = :operacao_id
            ORDER BY criado_em DESC
        """), {"operacao_id": exigir_operacao_ativa_id(conn)})

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
        exigir_operacao_editavel_id(conn)
        conn.execute(
            text("""
                INSERT INTO ordens (titulo, descricao, estado, recurso_id, ocorrencia_id, operacao_id)
                VALUES (:titulo, :descricao, :estado, :recurso_id, :ocorrencia_id,
                        (SELECT CAST(valor AS INTEGER) FROM configuracao WHERE chave='operacao_ativa'))
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
                INSERT INTO timeline_eventos (tipo, descricao, operacao_id)
                VALUES ('ordem', :descricao, (SELECT CAST(valor AS INTEGER) FROM configuracao WHERE chave='operacao_ativa'))
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
                INSERT INTO timeline_eventos (tipo, descricao, operacao_id)
                VALUES ('ordem', :descricao, (SELECT CAST(valor AS INTEGER) FROM configuracao WHERE chave='operacao_ativa'))
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
            SELECT m.id, m.titulo, m.descricao, m.prioridade, m.estado, m.recurso_id,
                   m.ocorrencia_id, m.objetivo_id, m.responsavel, m.notas, m.situacao_operacional,
                   m.atualizada_em, m.criado_em, m.planeada_em, m.iniciada_em,
                   m.concluida_em, m.cancelada_em,
                   COALESCE(
                       ARRAY_AGG(mr.recurso_id ORDER BY mr.atribuido_em)
                           FILTER (WHERE mr.recurso_id IS NOT NULL),
                       ARRAY[]::INTEGER[]
                   ) AS recurso_ids
            FROM missoes m
            LEFT JOIN missao_recursos mr ON mr.missao_id = m.id
            WHERE m.operacao_id = :operacao_id
            GROUP BY m.id
            ORDER BY m.criado_em DESC
        """), {"operacao_id": exigir_operacao_ativa_id(conn)})
        return [dict(linha._mapping) for linha in resultado]


class Missao(BaseModel):
    titulo: str
    descricao: str = ""
    prioridade: str = "media"
    estado: str = "planeada"
    recurso_id: int | None = None
    ocorrencia_id: int | None = None
    responsavel: str | None = None
    notas: str | None = None
    situacao_operacional: str = "estavel"


class EstadoMissao(BaseModel):
    estado: str


class SituacaoMissao(BaseModel):
    situacao_operacional: str


class NotaMissao(BaseModel):
    texto: str
    autor: str | None = None


def _atualizar_recurso_principal_missao(conn, missao_id: int):
    principal = conn.execute(text("""
        SELECT recurso_id
        FROM missao_recursos
        WHERE missao_id = :missao_id
        ORDER BY atribuido_em, id
        LIMIT 1
    """), {"missao_id": missao_id}).scalar()
    conn.execute(text("UPDATE missoes SET recurso_id = :recurso_id WHERE id = :missao_id"), {
        "recurso_id": principal, "missao_id": missao_id
    })


def _libertar_recurso_se_sem_missao_ativa(conn, recurso_id: int):
    ainda_ativo = conn.execute(text("""
        SELECT 1
        FROM missao_recursos mr
        JOIN missoes m ON m.id = mr.missao_id
        WHERE mr.recurso_id = :recurso_id
          AND m.estado NOT IN ('concluida', 'cancelada')
        LIMIT 1
    """), {"recurso_id": recurso_id}).scalar()
    if not ainda_ativo:
        conn.execute(text("UPDATE recursos SET estado = 'disponivel' WHERE id = :id"), {"id": recurso_id})


@app.post("/missoes")
def criar_missao(missao: Missao):
    estados_validos = {"recebida", "planeada", "em_execucao", "concluida", "cancelada"}
    estado = missao.estado if missao.estado in estados_validos else "planeada"
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        missao_id = conn.execute(text("""
            INSERT INTO missoes (
                titulo, descricao, prioridade, estado, recurso_id, ocorrencia_id,
                operacao_id, responsavel, notas, situacao_operacional, atualizada_em,
                planeada_em, iniciada_em, concluida_em, cancelada_em
            )
            VALUES (
                :titulo, :descricao, :prioridade, :estado, :recurso_id, :ocorrencia_id,
                :operacao_id, :responsavel, :notas, :situacao_operacional, NOW(),
                CASE WHEN :estado IN ('planeada','em_execucao','concluida','cancelada') THEN NOW() END,
                CASE WHEN :estado = 'em_execucao' THEN NOW() END,
                CASE WHEN :estado = 'concluida' THEN NOW() END,
                CASE WHEN :estado = 'cancelada' THEN NOW() END
            )
            RETURNING id
        """), {
            "titulo": missao.titulo.strip(), "descricao": missao.descricao,
            "prioridade": missao.prioridade, "estado": estado,
            "recurso_id": missao.recurso_id, "ocorrencia_id": missao.ocorrencia_id,
            "operacao_id": operacao_id, "responsavel": missao.responsavel,
            "notas": missao.notas,
            "situacao_operacional": missao.situacao_operacional if missao.situacao_operacional in {"sob_controlo", "estavel", "complexa", "critica", "necessita_reforco"} else "estavel",
        }).scalar_one()
        if missao.recurso_id is not None:
            conn.execute(text("""
                INSERT INTO missao_recursos (missao_id, recurso_id)
                VALUES (:missao_id, :recurso_id)
                ON CONFLICT (missao_id, recurso_id) DO NOTHING
            """), {"missao_id": missao_id, "recurso_id": missao.recurso_id})
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"Missão criada: {missao.titulo.strip()}",
                 "operacao_id": operacao_id, "ocorrencia_id": missao.ocorrencia_id})
    return {"mensagem": "Missão criada com sucesso", "id": missao_id}


@app.put("/missoes/{missao_id}/estado")
def alterar_estado_missao(missao_id: int, dados: EstadoMissao):
    estados_validos = {"recebida", "planeada", "em_execucao", "concluida", "cancelada"}
    if dados.estado not in estados_validos:
        raise HTTPException(status_code=400, detail="Estado de missão inválido")

    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        missao = conn.execute(text("""
            SELECT id, titulo, ocorrencia_id
            FROM missoes
            WHERE id = :id AND operacao_id = :operacao_id
        """), {"id": missao_id, "operacao_id": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="Missão não encontrada")

        conn.execute(text("""
            UPDATE missoes
            SET estado = :estado, atualizada_em = NOW(),
                planeada_em = CASE WHEN :estado = 'planeada' THEN COALESCE(planeada_em, NOW()) ELSE planeada_em END,
                iniciada_em = CASE WHEN :estado = 'em_execucao' THEN COALESCE(iniciada_em, NOW()) ELSE iniciada_em END,
                concluida_em = CASE WHEN :estado = 'concluida' THEN COALESCE(concluida_em, NOW()) ELSE concluida_em END,
                cancelada_em = CASE WHEN :estado = 'cancelada' THEN COALESCE(cancelada_em, NOW()) ELSE cancelada_em END
            WHERE id = :id
        """), {"estado": dados.estado, "id": missao_id})

        recurso_ids = [linha[0] for linha in conn.execute(text(
            "SELECT recurso_id FROM missao_recursos WHERE missao_id = :id"
        ), {"id": missao_id})]
        if dados.estado == "em_execucao" and recurso_ids:
            conn.execute(text("UPDATE recursos SET estado = 'em_missao' WHERE id = ANY(:ids)"), {"ids": recurso_ids})
        elif dados.estado in {"concluida", "cancelada"}:
            for recurso_id in recurso_ids:
                _libertar_recurso_se_sem_missao_ativa(conn, recurso_id)

        rotulos = {"recebida": "Recebida", "planeada": "Planeada",
                   "em_execucao": "Em execução", "concluida": "Concluída",
                   "cancelada": "Cancelada"}
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"Missão {missao['titulo']} alterada para {rotulos[dados.estado]}",
                 "operacao_id": operacao_id, "ocorrencia_id": missao["ocorrencia_id"]})
    return {"mensagem": "Estado da missão atualizado"}


@app.put("/missoes/{missao_id}/situacao")
def alterar_situacao_missao(missao_id: int, dados: SituacaoMissao):
    situacoes_validas = {"sob_controlo", "estavel", "complexa", "critica", "necessita_reforco"}
    if dados.situacao_operacional not in situacoes_validas:
        raise HTTPException(status_code=400, detail="Situação operacional inválida")
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        missao = conn.execute(text("""
            SELECT id, titulo, ocorrencia_id FROM missoes
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": missao_id, "operacao_id": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="Missão não encontrada")
        conn.execute(text("""
            UPDATE missoes SET situacao_operacional=:situacao, atualizada_em=NOW() WHERE id=:id
        """), {"situacao": dados.situacao_operacional, "id": missao_id})
        rotulos = {
            "sob_controlo": "Sob controlo", "estavel": "Estável", "complexa": "Complexa",
            "critica": "Crítica", "necessita_reforco": "Necessita de reforço"
        }
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"Situação da missão {missao['titulo']}: {rotulos[dados.situacao_operacional]}",
                 "operacao_id": operacao_id, "ocorrencia_id": missao["ocorrencia_id"]})
    return {"mensagem": "Situação operacional atualizada"}


@app.get("/missoes/{missao_id}/notas")
def listar_notas_missao(missao_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        existe = conn.execute(text("SELECT 1 FROM missoes WHERE id=:id AND operacao_id=:operacao_id"),
                              {"id": missao_id, "operacao_id": operacao_id}).scalar()
        if not existe:
            raise HTTPException(status_code=404, detail="Missão não encontrada")
        rows = conn.execute(text("""
            SELECT id, autor, texto, criado_em FROM missao_notas
            WHERE missao_id=:id ORDER BY criado_em DESC, id DESC
        """), {"id": missao_id})
        return [dict(r._mapping) for r in rows]


@app.post("/missoes/{missao_id}/notas")
def adicionar_nota_missao(missao_id: int, nota: NotaMissao):
    texto_nota = nota.texto.strip()
    if not texto_nota:
        raise HTTPException(status_code=400, detail="A nota não pode estar vazia")
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        missao = conn.execute(text("""
            SELECT id, titulo, ocorrencia_id FROM missoes
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": missao_id, "operacao_id": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="Missão não encontrada")
        nota_id = conn.execute(text("""
            INSERT INTO missao_notas (missao_id, autor, texto)
            VALUES (:missao_id, :autor, :texto) RETURNING id
        """), {"missao_id": missao_id, "autor": (nota.autor or "Operador").strip(), "texto": texto_nota}).scalar_one()
        conn.execute(text("UPDATE missoes SET atualizada_em=NOW() WHERE id=:id"), {"id": missao_id})
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"Nova nota na missão {missao['titulo']}: {texto_nota[:120]}",
                 "operacao_id": operacao_id, "ocorrencia_id": missao["ocorrencia_id"]})
    return {"mensagem": "Nota registada", "id": nota_id}


@app.get("/missoes/{missao_id}/estatisticas")
def estatisticas_missao(missao_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        missao = conn.execute(text("""
            SELECT m.*,
                   EXTRACT(EPOCH FROM (COALESCE(m.concluida_em, m.cancelada_em, NOW()) - COALESCE(m.iniciada_em, m.planeada_em, m.criado_em)))::INTEGER AS tempo_decorrido_segundos
            FROM missoes m WHERE m.id=:id AND m.operacao_id=:operacao_id
        """), {"id": missao_id, "operacao_id": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="Missão não encontrada")
        total_recursos = conn.execute(text("SELECT COUNT(*) FROM missao_recursos WHERE missao_id=:id"), {"id": missao_id}).scalar() or 0
        total_elementos = conn.execute(text("""
            SELECT COUNT(DISTINCT e.id) FROM elementos e
            WHERE e.recurso_id IN (SELECT recurso_id FROM missao_recursos WHERE missao_id=:id)
              AND e.operacao_id=:operacao_id
        """), {"id": missao_id, "operacao_id": operacao_id}).scalar() or 0
        total_ordens = conn.execute(text("""
            SELECT COUNT(*) FROM ordens o
            WHERE o.operacao_id=:operacao_id
              AND (o.ocorrencia_id = :ocorrencia_id OR o.recurso_id IN (SELECT recurso_id FROM missao_recursos WHERE missao_id=:id))
        """), {"id": missao_id, "operacao_id": operacao_id, "ocorrencia_id": missao["ocorrencia_id"]}).scalar() or 0
        return {"tempo_decorrido_segundos": missao["tempo_decorrido_segundos"], "total_recursos": total_recursos,
                "total_elementos": total_elementos, "total_ordens": total_ordens, "ultima_atualizacao": missao["atualizada_em"]}


@app.get("/missoes/{missao_id}/timeline")
def timeline_missao(missao_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        missao = conn.execute(text("SELECT id, titulo, ocorrencia_id, criado_em FROM missoes WHERE id=:id AND operacao_id=:operacao_id"),
                              {"id": missao_id, "operacao_id": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="Missão não encontrada")
        rows = conn.execute(text("""
            SELECT id, tipo, descricao, criado_em FROM timeline_eventos
            WHERE operacao_id=:operacao_id AND tipo='missao'
              AND (descricao ILIKE :padrao OR ocorrencia_id=:ocorrencia_id)
            ORDER BY criado_em DESC, id DESC LIMIT 100
        """), {"operacao_id": operacao_id, "padrao": f"%{missao['titulo']}%", "ocorrencia_id": missao["ocorrencia_id"]})
        return [dict(r._mapping) for r in rows]


@app.get("/missoes/{missao_id}/recursos")
def listar_recursos_missao(missao_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        existe = conn.execute(text(
            "SELECT 1 FROM missoes WHERE id=:id AND operacao_id=:operacao_id"
        ), {"id": missao_id, "operacao_id": operacao_id}).scalar()
        if not existe:
            raise HTTPException(status_code=404, detail="Missão não encontrada")
        resultado = conn.execute(text("""
            SELECT r.*, mr.atribuido_em
            FROM missao_recursos mr
            JOIN recursos r ON r.id = mr.recurso_id
            WHERE mr.missao_id = :missao_id
            ORDER BY mr.atribuido_em, r.nome
        """), {"missao_id": missao_id})
        return [dict(linha._mapping) for linha in resultado]


@app.put("/missoes/{missao_id}/atribuir-recurso/{recurso_id}")
def atribuir_recurso_missao(missao_id: int, recurso_id: int):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        missao = conn.execute(text("""
            SELECT id, titulo, estado, ocorrencia_id
            FROM missoes WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": missao_id, "operacao_id": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="Missão não encontrada")
        recurso = conn.execute(text("""
            SELECT id, nome, indicativo_radio FROM recursos
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": recurso_id, "operacao_id": operacao_id}).mappings().first()
        if not recurso:
            raise HTTPException(status_code=404, detail="Recurso não encontrado na operação ativa")
        conn.execute(text("""
            INSERT INTO missao_recursos (missao_id, recurso_id)
            VALUES (:missao_id, :recurso_id)
            ON CONFLICT (missao_id, recurso_id) DO NOTHING
        """), {"missao_id": missao_id, "recurso_id": recurso_id})
        _atualizar_recurso_principal_missao(conn, missao_id)
        if missao["estado"] == "em_execucao":
            conn.execute(text("UPDATE recursos SET estado = 'em_missao' WHERE id = :id"), {"id": recurso_id})
        nome_recurso = recurso["indicativo_radio"] or recurso["nome"] or f"Recurso {recurso_id}"
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"{nome_recurso} adicionado à missão {missao['titulo']}",
                 "operacao_id": operacao_id, "ocorrencia_id": missao["ocorrencia_id"]})
    return {"mensagem": "Recurso adicionado à missão"}


@app.delete("/missoes/{missao_id}/recursos/{recurso_id}")
def remover_recurso_missao(missao_id: int, recurso_id: int):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        missao = conn.execute(text("""
            SELECT id, titulo, ocorrencia_id FROM missoes
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": missao_id, "operacao_id": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="Missão não encontrada")
        recurso = conn.execute(text("SELECT nome, indicativo_radio FROM recursos WHERE id=:id"), {"id": recurso_id}).mappings().first()
        resultado = conn.execute(text("""
            DELETE FROM missao_recursos
            WHERE missao_id=:missao_id AND recurso_id=:recurso_id
        """), {"missao_id": missao_id, "recurso_id": recurso_id})
        if resultado.rowcount == 0:
            raise HTTPException(status_code=404, detail="O recurso não está associado à missão")
        _atualizar_recurso_principal_missao(conn, missao_id)
        _libertar_recurso_se_sem_missao_ativa(conn, recurso_id)
        nome_recurso = ((recurso or {}).get("indicativo_radio") or (recurso or {}).get("nome") or f"Recurso {recurso_id}")
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"{nome_recurso} removido da missão {missao['titulo']}",
                 "operacao_id": operacao_id, "ocorrencia_id": missao["ocorrencia_id"]})
    return {"mensagem": "Recurso removido da missão"}


@app.put("/missoes/{missao_id}/concluir")
def concluir_missao(missao_id: int):
    return alterar_estado_missao(missao_id, EstadoMissao(estado="concluida"))

@app.get("/relatorio")
def relatorio():
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        params = {"operacao_id": operacao_id}
        total_recursos = conn.execute(text("""
            SELECT COUNT(DISTINCT r.id)
            FROM recursos r
            JOIN operacao_recursos opr
              ON opr.operacao_id = r.operacao_id
             AND opr.recurso_catalogo_id = r.recurso_catalogo_id
             AND opr.estado = 'participante'
             AND opr.saida_em IS NULL
            WHERE r.operacao_id = :operacao_id
        """), params).scalar()
        total_elementos = conn.execute(text("""
            SELECT COUNT(DISTINCT e.id)
            FROM elementos e
            JOIN operacao_elementos ope
              ON ope.operacao_id = e.operacao_id
             AND ope.elemento_catalogo_id = e.elemento_catalogo_id
             AND ope.estado = 'participante'
             AND ope.saida_em IS NULL
            WHERE e.operacao_id = :operacao_id
        """), params).scalar()
        total_ocorrencias = conn.execute(text("SELECT COUNT(*) FROM ocorrencias WHERE operacao_id=:operacao_id"), params).scalar()
        total_missoes = conn.execute(text("SELECT COUNT(*) FROM missoes WHERE operacao_id=:operacao_id"), params).scalar()
        missoes_ativas = conn.execute(text("SELECT COUNT(*) FROM missoes WHERE operacao_id=:operacao_id AND estado != 'concluida'"), params).scalar()
        missoes_concluidas = conn.execute(text("SELECT COUNT(*) FROM missoes WHERE operacao_id=:operacao_id AND estado = 'concluida'"), params).scalar()
        total_ordens = conn.execute(text("SELECT COUNT(*) FROM ordens WHERE operacao_id=:operacao_id"), params).scalar()

        return {
            "recursos": total_recursos,
            "elementos": total_elementos,
            "ocorrencias": total_ocorrencias,
            "missoes_total": total_missoes,
            "missoes_ativas": missoes_ativas,
            "missoes_concluidas": missoes_concluidas,
            "ordens": total_ordens
        }
    
@app.get("/elementos")
def listar_elementos():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT
                e.id,
                e.nome,
                COALESCE(ope.funcao_operacional, e.funcao) AS funcao,
                e.entidade,
                e.estado,
                COALESCE(ope.indicativo_operacional, e.indicativo_radio) AS indicativo_radio,
                e.recurso_id,
                e.ocorrencia_id,
                ST_Y(e.localizacao) AS latitude,
                ST_X(e.localizacao) AS longitude,
                e.criado_em,
                e.elemento_catalogo_id
            FROM elementos e
            JOIN operacao_elementos ope
              ON ope.operacao_id = e.operacao_id
             AND ope.elemento_catalogo_id = e.elemento_catalogo_id
             AND ope.estado = 'participante'
             AND ope.saida_em IS NULL
            WHERE e.operacao_id = :operacao_id
        """), {"operacao_id": exigir_operacao_ativa_id(conn)})

        dados = []
        for linha in resultado:
            dados.append(dict(linha._mapping))

        return dados
    
@app.post("/elementos")
async def criar_elemento(request: Request):
    dados = await request.json()

    latitude = dados.get("latitude")
    longitude = dados.get("longitude")

    if latitude is not None and longitude is not None:
        localizacao_sql = "ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)"
    else:
        localizacao_sql = "NULL"

    with engine.begin() as conn:
        dados["operacao_id"] = exigir_operacao_editavel_id(conn)
        catalogo_id = conn.execute(text("""
            INSERT INTO elementos_catalogo (nome, entidade, estado)
            VALUES (:nome, NULLIF(:entidade, ''), 'ativo')
            ON CONFLICT (nome, entidade) DO UPDATE SET estado = 'ativo'
            RETURNING id
        """), dados).scalar_one()
        dados["elemento_catalogo_id"] = catalogo_id
        conn.execute(text("""
            INSERT INTO operacao_elementos (
                operacao_id, elemento_catalogo_id, indicativo_operacional,
                funcao_operacional, estado, saida_em
            ) VALUES (
                :operacao_id, :elemento_catalogo_id, :indicativo_radio,
                :funcao, 'participante', NULL
            )
            ON CONFLICT (operacao_id, elemento_catalogo_id) DO UPDATE SET
                indicativo_operacional = EXCLUDED.indicativo_operacional,
                funcao_operacional = EXCLUDED.funcao_operacional,
                estado = 'participante', saida_em = NULL
        """), dados)
        conn.execute(
            text(f"""
                INSERT INTO elementos (
                    nome,
                    funcao,
                    entidade,
                    estado,
                    indicativo_radio,
                    recurso_id,
                    ocorrencia_id,
                    localizacao,
                    operacao_id,
                    elemento_catalogo_id
                )
                VALUES (
                    :nome,
                    :funcao,
                    :entidade,
                    :estado,
                    :indicativo_radio,
                    :recurso_id,
                    :ocorrencia_id,
                    {localizacao_sql},
                    :operacao_id,
                    :elemento_catalogo_id
                )
            """),
            dados
        )

    return {"ok": True}

@app.put("/elementos/{elemento_id}/posicao")
def atualizar_posicao_elemento(elemento_id: int, dados: dict):
    with engine.begin() as conn:
        elemento = conn.execute(
            text("""
                SELECT nome, indicativo_radio, ocorrencia_id
                FROM elementos
                WHERE id = :id
            """),
            {"id": elemento_id}
        ).fetchone()

        if not elemento:
            return {"erro": "Elemento não encontrado"}

        nome = elemento[0]
        indicativo = elemento[1] or ""
        ocorrencia_id = elemento[2]

        texto_elemento = f"{nome} ({indicativo})" if indicativo else nome

        conn.execute(
            text("""
                UPDATE elementos
                SET localizacao = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
                    estado = 'apeado',
                    recurso_id = NULL
                WHERE id = :id
            """),
            {
                "latitude": dados["latitude"],
                "longitude": dados["longitude"],
                "id": elemento_id
            }
        )

        conn.execute(
            text("""
                INSERT INTO timeline_eventos (tipo, descricao, ocorrencia_id, operacao_id)
                VALUES ('elemento', :descricao, :ocorrencia_id, (SELECT CAST(valor AS INTEGER) FROM configuracao WHERE chave='operacao_ativa'))
            """),
            {
                "descricao": f"Elemento apeado/deslocado: {texto_elemento}",
                "ocorrencia_id": ocorrencia_id
            }
        )

    return {"mensagem": "Elemento atualizado"}

@app.put("/elementos/{elemento_id}/reembarcar/{recurso_id}")
def reembarcar_elemento(elemento_id: int, recurso_id: int):
    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE elementos
                SET
                    recurso_id = :recurso_id,
                    estado = 'embarcado',
                    localizacao = NULL
                WHERE id = :elemento_id
            """),
            {
                "elemento_id": elemento_id,
                "recurso_id": recurso_id
            }
        )

    return {"ok": True}

@app.get("/recursos/{recurso_id}/historico")
def historico_recurso(recurso_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        total_ocorrencias = conn.execute(
            text("""
                SELECT COUNT(DISTINCT ocorrencia_id)
                FROM timeline_eventos
                WHERE recurso_id = :recurso_id
                AND operacao_id = :operacao_id
                AND ocorrencia_id IS NOT NULL
            """),
            {"recurso_id": recurso_id, "operacao_id": operacao_id}
        ).scalar()

        total_missoes = conn.execute(
            text("""
                SELECT COUNT(*)
                FROM missoes
                WHERE recurso_id = :recurso_id
                AND operacao_id = :operacao_id
            """),
            {"recurso_id": recurso_id, "operacao_id": operacao_id}
        ).scalar()

        ordens_executadas = conn.execute(
            text("""
                SELECT COUNT(*)
                FROM ordens
                WHERE recurso_id = :recurso_id
                AND operacao_id = :operacao_id
                AND estado = 'executada'
            """),
            {"recurso_id": recurso_id, "operacao_id": operacao_id}
        ).scalar()

        eventos = conn.execute(
            text("""
                SELECT id, tipo, descricao, ocorrencia_id, criado_em
                FROM timeline_eventos
                WHERE recurso_id = :recurso_id
                AND operacao_id = :operacao_id
                ORDER BY criado_em DESC
            """),
            {"recurso_id": recurso_id, "operacao_id": operacao_id}
        )

        chegadas_registadas = conn.execute(
            text("""
                SELECT DISTINCT ocorrencia_id
                FROM timeline_eventos
                WHERE recurso_id = :recurso_id
                AND operacao_id = :operacao_id
                AND tipo = 'chegada'
                AND ocorrencia_id IS NOT NULL
            """),
            {"recurso_id": recurso_id, "operacao_id": operacao_id}
        )

        chegadas_ids = [linha[0] for linha in chegadas_registadas]

        return {
            "recurso_id": recurso_id,
            "total_ocorrencias": total_ocorrencias,
            "total_missoes": total_missoes,
            "ordens_executadas": ordens_executadas,
            "chegadas_registadas": chegadas_ids,
            "eventos": [dict(linha._mapping) for linha in eventos]
        }


# ==================== SETORES OPERACIONAIS — SPRINT 10.1 ====================
class SetorOperacional(BaseModel):
    nome: str
    descricao: str = ""
    cor: str = "#2563eb"
    estado: str = "ativo"
    comandante: str | None = None
    notas: str | None = None

class SetorAtualizacao(SetorOperacional):
    arquivado: bool = False

class AssociacaoSetor(BaseModel):
    setor_id: int | None = None

def _validar_setor(dados):
    estados = {"planeado", "ativo", "suspenso", "encerrado"}
    if dados.estado not in estados:
        raise HTTPException(status_code=400, detail="Estado de setor inválido")
    if not dados.nome.strip():
        raise HTTPException(status_code=400, detail="O nome do setor é obrigatório")
    if not dados.cor or not dados.cor.startswith("#") or len(dados.cor) not in (4, 7):
        raise HTTPException(status_code=400, detail="Cor do setor inválida")

@app.get("/setores")
def listar_setores(incluir_arquivados: bool = False):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        rows = conn.execute(text("""
            SELECT s.*,
                   COUNT(DISTINCT o.id)::INTEGER AS total_objetivos,
                   COUNT(DISTINCT m.id)::INTEGER AS total_missoes
            FROM setores s
            LEFT JOIN objetivos o ON o.setor_id=s.id
            LEFT JOIN missoes m ON m.setor_id=s.id OR m.objetivo_id=o.id
            WHERE s.operacao_id=:op AND (:todos OR s.arquivado=FALSE)
            GROUP BY s.id
            ORDER BY s.arquivado, s.nome
        """), {"op": operacao_id, "todos": incluir_arquivados})
        return [dict(r._mapping) for r in rows]

@app.post("/setores")
def criar_setor(dados: SetorOperacional):
    _validar_setor(dados)
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        setor_id = conn.execute(text("""
            INSERT INTO setores (operacao_id,nome,descricao,cor,estado,comandante,notas)
            VALUES (:op,:nome,:descricao,:cor,:estado,:comandante,:notas)
            RETURNING id
        """), {**dados.model_dump(), "op": operacao_id, "nome": dados.nome.strip()}).scalar_one()
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo,descricao,operacao_id)
            VALUES ('setor',:descricao,:op)
        """), {"descricao": f"Setor criado: {dados.nome.strip()}", "op": operacao_id})
        return {"id": setor_id, "mensagem": "Setor criado"}

@app.put("/setores/{setor_id}")
def atualizar_setor(setor_id: int, dados: SetorAtualizacao):
    _validar_setor(dados)
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        atualizado = conn.execute(text("""
            UPDATE setores
            SET nome=:nome,descricao=:descricao,cor=:cor,estado=:estado,
                comandante=:comandante,notas=:notas,arquivado=:arquivado,
                atualizado_em=NOW()
            WHERE id=:id AND operacao_id=:op
            RETURNING id
        """), {**dados.model_dump(), "id": setor_id, "op": operacao_id, "nome": dados.nome.strip()}).scalar()
        if not atualizado:
            raise HTTPException(status_code=404, detail="Setor não encontrado")
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo,descricao,operacao_id)
            VALUES ('setor',:descricao,:op)
        """), {"descricao": f"Setor atualizado: {dados.nome.strip()}", "op": operacao_id})
    return {"mensagem": "Setor atualizado"}

@app.delete("/setores/{setor_id}")
def eliminar_setor(setor_id: int):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        total = conn.execute(text("""
            SELECT
              (SELECT COUNT(*) FROM objetivos WHERE setor_id=:id) +
              (SELECT COUNT(*) FROM missoes WHERE setor_id=:id)
        """), {"id": setor_id}).scalar() or 0
        if total:
            conn.execute(text("""
                UPDATE setores SET arquivado=TRUE,atualizado_em=NOW()
                WHERE id=:id AND operacao_id=:op
            """), {"id": setor_id, "op": operacao_id})
            return {"mensagem": "Setor arquivado porque possui objetivos ou missões associados", "arquivado": True}
        apagado = conn.execute(text("""
            DELETE FROM setores WHERE id=:id AND operacao_id=:op RETURNING id
        """), {"id": setor_id, "op": operacao_id}).scalar()
        if not apagado:
            raise HTTPException(status_code=404, detail="Setor não encontrado")
    return {"mensagem": "Setor eliminado", "arquivado": False}

@app.put("/objetivos/{objetivo_id}/setor")
def associar_setor_objetivo(objetivo_id: int, dados: AssociacaoSetor):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        if dados.setor_id is not None:
            existe = conn.execute(text("""
                SELECT 1 FROM setores
                WHERE id=:id AND operacao_id=:op AND arquivado=FALSE
            """), {"id": dados.setor_id, "op": operacao_id}).scalar()
            if not existe:
                raise HTTPException(status_code=404, detail="Setor não encontrado")
        objetivo = conn.execute(text("""
            UPDATE objetivos SET setor_id=:setor_id,atualizado_em=NOW()
            WHERE id=:id AND operacao_id=:op
            RETURNING nome,ocorrencia_id
        """), {"setor_id": dados.setor_id, "id": objetivo_id, "op": operacao_id}).mappings().first()
        if not objetivo:
            raise HTTPException(status_code=404, detail="Objetivo não encontrado")
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo,descricao,operacao_id,ocorrencia_id)
            VALUES ('setor',:descricao,:op,:oc)
        """), {"descricao": f"Setor do objetivo {objetivo['nome']} atualizado", "op": operacao_id, "oc": objetivo["ocorrencia_id"]})
    return {"mensagem": "Setor do objetivo atualizado"}

@app.put("/missoes/{missao_id}/setor")
def associar_setor_missao(missao_id: int, dados: AssociacaoSetor):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        if dados.setor_id is not None:
            existe = conn.execute(text("""
                SELECT 1 FROM setores
                WHERE id=:id AND operacao_id=:op AND arquivado=FALSE
            """), {"id": dados.setor_id, "op": operacao_id}).scalar()
            if not existe:
                raise HTTPException(status_code=404, detail="Setor não encontrado")
        missao = conn.execute(text("""
            UPDATE missoes SET setor_id=:setor_id,atualizada_em=NOW()
            WHERE id=:id AND operacao_id=:op
            RETURNING titulo,ocorrencia_id
        """), {"setor_id": dados.setor_id, "id": missao_id, "op": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="Missão não encontrada")
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo,descricao,operacao_id,ocorrencia_id)
            VALUES ('setor',:descricao,:op,:oc)
        """), {"descricao": f"Setor da missão {missao['titulo']} atualizado", "op": operacao_id, "oc": missao["ocorrencia_id"]})
    return {"mensagem": "Setor da missão atualizado"}

# ==================== OBJETIVOS OPERACIONAIS — SPRINT 9.1 ====================
class ObjetivoOperacional(BaseModel):
    nome: str
    descricao: str = ""
    prioridade: str = "normal"
    estado: str = "planeado"
    responsavel: str | None = None
    ocorrencia_id: int | None = None
    modelo_id: int | None = None
    latitude: float | None = None
    longitude: float | None = None
    notas: str | None = None

class ObjetivoAtualizacao(ObjetivoOperacional):
    arquivado: bool = False

class ModeloObjetivo(BaseModel):
    nome: str
    descricao: str = ""
    prioridade: str = "normal"
    ativo: bool = True

class AssociacaoObjetivoMissao(BaseModel):
    objetivo_id: int | None = None

def _validar_objetivo(dados):
    prioridades = {"critica", "alta", "normal", "baixa"}
    estados = {"planeado", "em_preparacao", "em_execucao", "suspenso", "concluido", "cancelado"}
    if dados.prioridade not in prioridades:
        raise HTTPException(status_code=400, detail="Prioridade de objetivo inválida")
    if dados.estado not in estados:
        raise HTTPException(status_code=400, detail="Estado de objetivo inválido")
    if not dados.nome.strip():
        raise HTTPException(status_code=400, detail="O nome do objetivo é obrigatório")

@app.get("/objetivos")
def listar_objetivos(incluir_arquivados: bool = False):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        rows = conn.execute(text("""
            SELECT o.*, COUNT(m.id)::INTEGER AS total_missoes
            FROM objetivos o
            LEFT JOIN missoes m ON m.objetivo_id=o.id
            WHERE o.operacao_id=:operacao_id
              AND (:incluir OR o.arquivado=FALSE)
            GROUP BY o.id
            ORDER BY CASE o.prioridade WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, o.criado_em
        """), {"operacao_id": operacao_id, "incluir": incluir_arquivados})
        return [dict(r._mapping) for r in rows]

@app.post("/objetivos")
def criar_objetivo(dados: ObjetivoOperacional):
    _validar_objetivo(dados)
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        oid = conn.execute(text("""
            INSERT INTO objetivos (operacao_id, ocorrencia_id, modelo_id, nome, descricao, prioridade, estado, responsavel, latitude, longitude, notas, concluido_em)
            VALUES (:operacao_id,:ocorrencia_id,:modelo_id,:nome,:descricao,:prioridade,:estado,:responsavel,:latitude,:longitude,:notas,CASE WHEN :estado='concluido' THEN NOW() END) RETURNING id
        """), {**dados.model_dump(), "operacao_id":operacao_id, "nome":dados.nome.strip()}).scalar_one()
        conn.execute(text("INSERT INTO timeline_eventos (tipo,descricao,operacao_id,ocorrencia_id) VALUES ('objetivo',:d,:op,:oc)"), {"d":f"Objetivo criado: {dados.nome.strip()}","op":operacao_id,"oc":dados.ocorrencia_id})
        return {"id":oid,"mensagem":"Objetivo criado"}

@app.put("/objetivos/{objetivo_id}")
def atualizar_objetivo(objetivo_id:int, dados: ObjetivoAtualizacao):
    _validar_objetivo(dados)
    with engine.begin() as conn:
        operacao_id=exigir_operacao_editavel_id(conn)
        existe=conn.execute(text("SELECT 1 FROM objetivos WHERE id=:id AND operacao_id=:op"),{"id":objetivo_id,"op":operacao_id}).scalar()
        if not existe: raise HTTPException(status_code=404, detail="Objetivo não encontrado")
        conn.execute(text("""UPDATE objetivos SET ocorrencia_id=:ocorrencia_id,modelo_id=:modelo_id,nome=:nome,descricao=:descricao,prioridade=:prioridade,estado=:estado,responsavel=:responsavel,latitude=:latitude,longitude=:longitude,notas=:notas,arquivado=:arquivado,atualizado_em=NOW(),concluido_em=CASE WHEN :estado='concluido' THEN COALESCE(concluido_em,NOW()) ELSE concluido_em END WHERE id=:id"""), {**dados.model_dump(),"id":objetivo_id,"nome":dados.nome.strip()})
        conn.execute(text("INSERT INTO timeline_eventos (tipo,descricao,operacao_id,ocorrencia_id) VALUES ('objetivo',:d,:op,:oc)"),{"d":f"Objetivo atualizado: {dados.nome.strip()}","op":operacao_id,"oc":dados.ocorrencia_id})
    return {"mensagem":"Objetivo atualizado"}

@app.delete("/objetivos/{objetivo_id}")
def eliminar_objetivo(objetivo_id:int):
    with engine.begin() as conn:
        operacao_id=exigir_operacao_editavel_id(conn)
        total=conn.execute(text("SELECT COUNT(*) FROM missoes WHERE objetivo_id=:id"),{"id":objetivo_id}).scalar() or 0
        if total:
            conn.execute(text("UPDATE objetivos SET arquivado=TRUE,atualizado_em=NOW() WHERE id=:id AND operacao_id=:op"),{"id":objetivo_id,"op":operacao_id})
            return {"mensagem":"Objetivo arquivado porque possui missões associadas","arquivado":True}
        apagado=conn.execute(text("DELETE FROM objetivos WHERE id=:id AND operacao_id=:op RETURNING id"),{"id":objetivo_id,"op":operacao_id}).scalar()
        if not apagado: raise HTTPException(status_code=404, detail="Objetivo não encontrado")
    return {"mensagem":"Objetivo eliminado","arquivado":False}

@app.put("/missoes/{missao_id}/objetivo")
def associar_objetivo_missao(missao_id:int, dados:AssociacaoObjetivoMissao):
    with engine.begin() as conn:
        operacao_id=exigir_operacao_editavel_id(conn)
        if dados.objetivo_id is not None:
            ok=conn.execute(text("SELECT 1 FROM objetivos WHERE id=:id AND operacao_id=:op AND arquivado=FALSE"),{"id":dados.objetivo_id,"op":operacao_id}).scalar()
            if not ok: raise HTTPException(status_code=404, detail="Objetivo não encontrado")
        atualizado=conn.execute(text("UPDATE missoes SET objetivo_id=:oid,atualizada_em=NOW() WHERE id=:id AND operacao_id=:op RETURNING titulo,ocorrencia_id"),{"oid":dados.objetivo_id,"id":missao_id,"op":operacao_id}).mappings().first()
        if not atualizado: raise HTTPException(status_code=404, detail="Missão não encontrada")
        conn.execute(text("INSERT INTO timeline_eventos (tipo,descricao,operacao_id,ocorrencia_id) VALUES ('objetivo',:d,:op,:oc)"),{"d":f"Objetivo da missão {atualizado['titulo']} atualizado","op":operacao_id,"oc":atualizado['ocorrencia_id']})
    return {"mensagem":"Objetivo da missão atualizado"}

@app.get("/objetivo-modelos")
def listar_modelos_objetivo(incluir_inativos:bool=False):
    with engine.connect() as conn:
        rows=conn.execute(text("SELECT * FROM objetivo_modelos WHERE (:todos OR ativo=TRUE) ORDER BY nome"),{"todos":incluir_inativos})
        return [dict(r._mapping) for r in rows]

@app.post("/objetivo-modelos")
def criar_modelo_objetivo(dados:ModeloObjetivo):
    if not dados.nome.strip(): raise HTTPException(status_code=400,detail="O nome é obrigatório")
    with engine.begin() as conn:
        exigir_operacao_editavel_id(conn)
        mid=conn.execute(text("INSERT INTO objetivo_modelos (nome,descricao,prioridade,ativo) VALUES (:nome,:descricao,:prioridade,:ativo) RETURNING id"),{**dados.model_dump(),"nome":dados.nome.strip()}).scalar_one()
    return {"id":mid,"mensagem":"Modelo criado"}

@app.put("/objetivo-modelos/{modelo_id}")
def atualizar_modelo_objetivo(modelo_id:int,dados:ModeloObjetivo):
    with engine.begin() as conn:
        exigir_operacao_editavel_id(conn)
        ok=conn.execute(text("UPDATE objetivo_modelos SET nome=:nome,descricao=:descricao,prioridade=:prioridade,ativo=:ativo,atualizado_em=NOW() WHERE id=:id RETURNING id"),{**dados.model_dump(),"id":modelo_id,"nome":dados.nome.strip()}).scalar()
        if not ok: raise HTTPException(status_code=404,detail="Modelo não encontrado")
    return {"mensagem":"Modelo atualizado"}

@app.delete("/objetivo-modelos/{modelo_id}")
def eliminar_modelo_objetivo(modelo_id:int):
    with engine.begin() as conn:
        exigir_operacao_editavel_id(conn)
        ok=conn.execute(text("DELETE FROM objetivo_modelos WHERE id=:id RETURNING id"),{"id":modelo_id}).scalar()
        if not ok: raise HTTPException(status_code=404,detail="Modelo não encontrado")
    return {"mensagem":"Modelo eliminado"}
