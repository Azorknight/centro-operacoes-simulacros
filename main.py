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
    origem_chamada: str | None = None
    contacto_chamada: str | None = None
    recebida_em: datetime | None = None

class ChamadaOcorrencia(BaseModel):
    informacao: str
    origem: str | None = None
    contacto: str | None = None
    recebido_em: datetime | None = None

def hora_operacional(valor: datetime | None):
    if valor is None:
        return datetime.now(ZoneInfo("Atlantic/Azores")).replace(tzinfo=None)
    return valor.astimezone(ZoneInfo("Atlantic/Azores")).replace(tzinfo=None) if valor.tzinfo else valor

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
    responsavel_nome: str | None = None
    responsavel_posto: str | None = None
    responsavel_funcao: str | None = None

class IntencaoComandante(BaseModel):
    intencao_comandante: str = ""

class DecisaoOperacional(BaseModel):
    texto: str
    autor: str | None = "Comandante"


class ConfirmacaoEliminacao(BaseModel):
    confirmacao: str

class RecursoCatalogo(BaseModel):
    nome: str
    tipo: str
    marca: str | None = None
    matricula: str | None = None
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
    posto: str | None = None
    estado: str = "ativo"

class ParticipacaoElemento(BaseModel):
    elemento_catalogo_id: int
    indicativo_operacional: str | None = None
    funcao_operacional: str | None = None
    recurso_catalogo_id: int | None = None

app = FastAPI(
    title="Centro de OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes e Simulacros"
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
    return {"mensagem": "Centro de OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes e Simulacros ativo"}

@app.get("/teste-bd")
def teste_bd():
    resultado = testar_ligacao()
    return {"resultado": resultado}

@app.get("/diagnostico")
def diagnostico_sistema():
    """DiagnÃƒÆ’Ã‚Â³stico simples e nÃƒÆ’Ã‚Â£o destrutivo dos principais serviÃƒÆ’Ã‚Â§os do SGO."""
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
                "replay": {"ok": True, "mensagem": "DisponÃƒÆ’Ã‚Â­vel"},
                "polling": {"ok": True, "intervalo_segundos": 5},
                "operacao": operacao,
                "contagens": contagens,
            }
    except Exception as erro:
        return {
            "ok": False,
            "verificado_em": verificado_em,
            "api": {"ok": True, "mensagem": "Ligada"},
            "base_dados": {"ok": False, "mensagem": "Erro de ligaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o"},
            "timeline": {"ok": False, "mensagem": "IndisponÃƒÆ’Ã‚Â­vel"},
            "replay": {"ok": False, "mensagem": "IndisponÃƒÆ’Ã‚Â­vel"},
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
    "setores", "objetivos", "objetivo_modelos", "missoes", "missao_recursos", "missao_notas", "decisoes_operacionais", "ordens", "timeline_eventos", "operacao_recursos",
    "operacao_elementos",
    "chamadas_ocorrencia", "elemento_empenhos",
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
        raise HTTPException(status_code=400, detail="Nome de backup invÃƒÆ’Ã‚Â¡lido")
    caminho = (BACKUP_DIR / nome).resolve()
    if caminho.parent != BACKUP_DIR.resolve():
        raise HTTPException(status_code=400, detail="Caminho de backup invÃƒÆ’Ã‚Â¡lido")
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
        raise HTTPException(status_code=404, detail="Backup nÃƒÆ’Ã‚Â£o encontrado")
    try:
        conteudo = json.loads(caminho.read_text(encoding="utf-8"))
    except Exception as erro:
        raise HTTPException(status_code=400, detail=f"Backup invÃƒÆ’Ã‚Â¡lido: {erro}")
    if conteudo.get("formato") != "SGO_BACKUP" or conteudo.get("versao_formato") != 1:
        raise HTTPException(status_code=400, detail="Formato de backup nÃƒÆ’Ã‚Â£o suportado")
    tabelas_dados = conteudo.get("tabelas")
    if not isinstance(tabelas_dados, dict):
        raise HTTPException(status_code=400, detail="Backup sem tabelas vÃƒÆ’Ã‚Â¡lidas")

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
                    raise ValueError(f"Dados invÃƒÆ’Ã‚Â¡lidos na tabela {nome_tabela}")
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
        raise HTTPException(status_code=500, detail=f"Falha no restauro; nenhuma alteraÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o foi aplicada: {erro}")

@app.delete("/backups/{nome}")
def eliminar_backup(nome: str):
    caminho = _caminho_backup(nome)
    if not caminho.exists():
        raise HTTPException(status_code=404, detail="Backup nÃƒÆ’Ã‚Â£o encontrado")
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
        raise HTTPException(status_code=409, detail="Nenhuma operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o ativa")
    return operacao_id


def exigir_operacao_editavel_id(conn):
    operacao_id = exigir_operacao_ativa_id(conn)
    estado = conn.execute(text("SELECT estado FROM operacoes WHERE id = :id"), {"id": operacao_id}).scalar()
    if estado == "concluida":
        raise HTTPException(status_code=409, detail="A operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o estÃƒÆ’Ã‚Â¡ concluÃƒÆ’Ã‚Â­da e encontra-se em modo de consulta")
    return operacao_id


def preparar_separacao_por_operacao():
    """Atualiza a estrutura sem apagar dados antigos."""
    with engine.begin() as conn:
        # Campos opcionais e aditivos: operações e registos anteriores mantêm-se intactos.
        for coluna in ("responsavel_nome TEXT", "responsavel_posto TEXT", "responsavel_funcao TEXT"):
            conn.execute(text(f"ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS {coluna}"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS chamadas_ocorrencia (
                id SERIAL PRIMARY KEY,
                operacao_id INTEGER NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
                ocorrencia_id INTEGER NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
                recebido_em TIMESTAMP NOT NULL DEFAULT NOW(),
                origem TEXT,
                contacto TEXT,
                informacao TEXT NOT NULL,
                registado_em TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chamadas_ocorrencia ON chamadas_ocorrencia(operacao_id, ocorrencia_id, recebido_em)"))
        # PAO: intenÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o do comandante associada ÃƒÆ’Ã‚Â  operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o.
        conn.execute(text("ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS intencao_comandante TEXT"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS decisoes_operacionais (
                id SERIAL PRIMARY KEY,
                operacao_id INTEGER NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
                texto TEXT NOT NULL,
                autor TEXT,
                criado_em TIMESTAMP DEFAULT NOW()
            )
        """))

        for tabela in ("recursos", "ocorrencias", "missoes", "ordens", "timeline_eventos", "elementos"):
            conn.execute(text(f"ALTER TABLE {tabela} ADD COLUMN IF NOT EXISTS operacao_id INTEGER"))

        for tabela in ("ordens", "timeline_eventos"):
            conn.execute(text(f"ALTER TABLE {tabela} ADD COLUMN IF NOT EXISTS elemento_id INTEGER REFERENCES elementos(id) ON DELETE SET NULL"))

        # Estrutura da OcorrÃƒÆ’Ã‚Âªncia Inteligente. As colunas sÃƒÆ’Ã‚Â£o acrescentadas sem apagar dados.
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
        conn.execute(text("UPDATE ocorrencias SET estado = 'encerrada', encerrada_em = COALESCE(encerrada_em, criado_em) WHERE LOWER(estado) IN ('fechada', 'fechado', 'concluida', 'concluÃƒÆ’Ã‚Â­do', 'concluido')"))

        # Estrutura de MissÃƒÆ’Ã‚Âµes v1: acrescenta metadados sem eliminar missÃƒÆ’Ã‚Âµes existentes.
        for coluna in (
            "responsavel TEXT",
            "zona TEXT",
            "notas TEXT",
            "situacao_operacional TEXT DEFAULT 'por_avaliar'",
            "atualizada_em TIMESTAMP",
            "planeada_em TIMESTAMP",
            "iniciada_em TIMESTAMP",
            "concluida_em TIMESTAMP",
            "cancelada_em TIMESTAMP"
        ):
            conn.execute(text(f"ALTER TABLE missoes ADD COLUMN IF NOT EXISTS {coluna}"))
        conn.execute(text("ALTER TABLE missoes ALTER COLUMN situacao_operacional SET DEFAULT 'por_avaliar'"))
        conn.execute(text("UPDATE missoes SET situacao_operacional = 'por_avaliar' WHERE situacao_operacional IS NULL OR TRIM(situacao_operacional) = ''"))
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

        # Sprint 10.1: setores operacionais editÃƒÆ’Ã‚Â¡veis.
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

        # Cada elemento conserva o período na ocorrência mesmo depois de apear.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS elemento_empenhos (
                id SERIAL PRIMARY KEY,
                operacao_id INTEGER NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
                elemento_id INTEGER NOT NULL REFERENCES elementos(id) ON DELETE CASCADE,
                recurso_id INTEGER REFERENCES recursos(id) ON DELETE SET NULL,
                ocorrencia_id INTEGER NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
                inicio_em TIMESTAMP NOT NULL DEFAULT NOW(),
                fim_em TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_elemento_empenho_aberto
            ON elemento_empenhos(operacao_id, elemento_id) WHERE fim_em IS NULL
        """))
        # Sprint 9.1: objetivos operacionais e modelos editÃƒÆ’Ã‚Â¡veis.
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

        # Sprint 8.2: uma missÃƒÆ’Ã‚Â£o pode ter vÃƒÆ’Ã‚Â¡rios recursos associados.
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
        for coluna in ("marca TEXT", "matricula TEXT"):
            conn.execute(text(f"ALTER TABLE recursos_catalogo ADD COLUMN IF NOT EXISTS {coluna}"))
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
        conn.execute(text("ALTER TABLE elementos_catalogo ADD COLUMN IF NOT EXISTS posto TEXT"))
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
        for coluna in ("chamado_em TIMESTAMP", "apresentado_em TIMESTAMP"):
            conn.execute(text(f"ALTER TABLE operacao_elementos ADD COLUMN IF NOT EXISTS {coluna}"))

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

        # Liga cada recurso operacional ao respetivo recurso permanente do catÃƒÆ’Ã‚Â¡logo.
        conn.execute(text("ALTER TABLE recursos ADD COLUMN IF NOT EXISTS recurso_catalogo_id INTEGER"))
        # Copia para o catÃƒÆ’Ã‚Â¡logo os recursos jÃƒÆ’Ã‚Â¡ conhecidos, sem duplicar.
        conn.execute(text("""
            INSERT INTO recursos_catalogo (nome, tipo, ilha)
            SELECT DISTINCT r.nome, r.tipo, r.ilha
            FROM recursos r
            WHERE r.nome IS NOT NULL AND r.tipo IS NOT NULL
            ON CONFLICT (nome, tipo) DO NOTHING
        """))

        # Associa os recursos operacionais jÃƒÆ’Ã‚Â¡ existentes ao catÃƒÆ’Ã‚Â¡logo.
        conn.execute(text("""
            UPDATE recursos r
            SET recurso_catalogo_id = rc.id
            FROM recursos_catalogo rc
            WHERE r.recurso_catalogo_id IS NULL
              AND rc.nome = r.nome
              AND rc.tipo = r.tipo
        """))

        # Preserva os recursos que jÃƒÆ’Ã‚Â¡ estavam nas operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes, criando a respetiva participaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o.
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

        # Materializa no Centro de OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes todos os recursos jÃƒÆ’Ã‚Â¡ preparados.
        # Quando ainda nÃƒÆ’Ã‚Â£o existe posiÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o guardada, usa um ponto inicial aproximado da ilha.
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
                            WHEN 'sÃƒÆ’Ã‚Â£o miguel' THEN -25.50
                            WHEN 'sao miguel' THEN -25.50
                            WHEN 'santa maria' THEN -25.10
                            WHEN 'terceira' THEN -27.22
                            WHEN 'graciosa' THEN -28.02
                            WHEN 'sÃƒÆ’Ã‚Â£o jorge' THEN -28.05
                            WHEN 'sao jorge' THEN -28.05
                            WHEN 'pico' THEN -28.32
                            WHEN 'faial' THEN -28.63
                            WHEN 'flores' THEN -31.20
                            WHEN 'corvo' THEN -31.11
                            ELSE -27.22
                        END,
                        CASE LOWER(COALESCE(rc.ilha, ''))
                            WHEN 'sÃƒÆ’Ã‚Â£o miguel' THEN 37.78
                            WHEN 'sao miguel' THEN 37.78
                            WHEN 'santa maria' THEN 36.97
                            WHEN 'terceira' THEN 38.66
                            WHEN 'graciosa' THEN 39.05
                            WHEN 'sÃƒÆ’Ã‚Â£o jorge' THEN 38.65
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
                            'Dados criados antes da separaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o por operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes.', 'arquivada')
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
                descricao, estado, data_inicio, data_fim, criado_em,
                responsavel_nome, responsavel_posto, responsavel_funcao
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
                    descricao, estado, data_inicio, data_fim,
                    responsavel_nome, responsavel_posto, responsavel_funcao
                )
                VALUES (
                    :nome, :tipo, :entidade_organizadora, :local, :objetivo,
                    :descricao, 'planeada', :data_inicio, :data_fim,
                    :responsavel_nome, :responsavel_posto, :responsavel_funcao
                )
                RETURNING
                    id, nome, tipo, entidade_organizadora, local, objetivo,
                    descricao, estado, data_inicio, data_fim, criado_em,
                responsavel_nome, responsavel_posto, responsavel_funcao
            """),
            operacao.model_dump()
        ).mappings().fetchone()
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id)
            VALUES ('operacao', :descricao, :operacao_id)
        """), {"descricao": f"Operação registada: {operacao.nome}", "operacao_id": nova["id"]})
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


@app.put("/operacoes/{operacao_id}/intencao-comandante")
def atualizar_intencao_comandante(operacao_id: int, dados: IntencaoComandante):
    with engine.begin() as conn:
        operacao_ativa_id = exigir_operacao_editavel_id(conn)
        if operacao_ativa_id != operacao_id:
            raise HTTPException(status_code=409, detail="A operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o indicada nÃƒÆ’Ã‚Â£o ÃƒÆ’Ã‚Â© a operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o ativa")

        atualizado = conn.execute(text("""
            UPDATE operacoes
            SET intencao_comandante = :intencao
            WHERE id = :id
            RETURNING id, intencao_comandante
        """), {
            "id": operacao_id,
            "intencao": dados.intencao_comandante.strip()
        }).mappings().first()

        if not atualizado:
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")

        return dict(atualizado)


@app.get("/operacoes/{operacao_id}/decisoes")
def listar_decisoes_operacionais(operacao_id: int):
    with engine.connect() as conn:
        existe = conn.execute(text("SELECT id FROM operacoes WHERE id = :id"), {"id": operacao_id}).scalar()
        if existe is None:
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        resultado = conn.execute(text("""
            SELECT id, operacao_id, texto, autor, criado_em
            FROM decisoes_operacionais
            WHERE operacao_id = :operacao_id
            ORDER BY criado_em DESC, id DESC
        """), {"operacao_id": operacao_id})
        return [dict(linha._mapping) for linha in resultado]


@app.post("/operacoes/{operacao_id}/decisoes")
def criar_decisao_operacional(operacao_id: int, dados: DecisaoOperacional):
    texto_decisao = dados.texto.strip()
    if not texto_decisao:
        raise HTTPException(status_code=400, detail="A decisÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o pode ficar vazia")
    with engine.begin() as conn:
        operacao_ativa_id = exigir_operacao_editavel_id(conn)
        if operacao_ativa_id != operacao_id:
            raise HTTPException(status_code=409, detail="A operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o indicada nÃƒÆ’Ã‚Â£o ÃƒÆ’Ã‚Â© a operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o ativa")
        nova = conn.execute(text("""
            INSERT INTO decisoes_operacionais (operacao_id, texto, autor, criado_em)
            VALUES (:operacao_id, :texto, :autor, NOW())
            RETURNING id, operacao_id, texto, autor, criado_em
        """), {
            "operacao_id": operacao_id,
            "texto": texto_decisao,
            "autor": (dados.autor or "Comandante").strip() or "Comandante"
        }).mappings().first()
        return dict(nova)


@app.post("/operacoes/{operacao_id}/ativar")
def ativar_operacao(operacao_id: int):
    with engine.begin() as conn:
        operacao = conn.execute(
            text("SELECT id, nome, estado FROM operacoes WHERE id = :id"),
            {"id": operacao_id}
        ).fetchone()

        if not operacao:
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")

        if operacao[2] == "arquivada":
            raise HTTPException(status_code=409, detail="Restaure a operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o antes de a abrir")

        conn.execute(text("""
            INSERT INTO configuracao (chave, valor)
            VALUES ('operacao_ativa', :valor)
            ON CONFLICT (chave)
            DO UPDATE SET valor = EXCLUDED.valor
        """), {"valor": str(operacao_id)})

        return {
            "mensagem": "OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o ativada",
            "operacao_id": operacao_id,
            "nome": operacao[1]
        }


@app.get("/operacoes/arquivadas")
def listar_operacoes_arquivadas():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT
                id, nome, tipo, entidade_organizadora, local, objetivo,
                descricao, estado, data_inicio, data_fim, criado_em,
                responsavel_nome, responsavel_posto, responsavel_funcao
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
            detail="ConfirmaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o invÃƒÆ’Ã‚Â¡lida. Escreva ELIMINAR."
        )

    with engine.begin() as conn:
        operacao = conn.execute(
            text("SELECT id, nome, estado FROM operacoes WHERE id = :id"),
            {"id": operacao_id}
        ).fetchone()

        if not operacao:
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")

        if operacao[2] != "arquivada":
            raise HTTPException(
                status_code=409,
                detail="Apenas operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes arquivadas podem ser eliminadas"
            )

        operacao_ativa_id = obter_operacao_ativa_id(conn)
        if operacao_ativa_id == operacao_id:
            raise HTTPException(
                status_code=409,
                detail="A operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o ativa nÃƒÆ’Ã‚Â£o pode ser eliminada"
            )

        # Apagar primeiro os registos dependentes, preservando as outras operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes.
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
            "mensagem": "OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o eliminada definitivamente",
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
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")

        if operacao[2] != 'arquivada':
            raise HTTPException(status_code=409, detail="A operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o estÃƒÆ’Ã‚Â¡ arquivada")

        conn.execute(
            text("UPDATE operacoes SET estado = 'planeada' WHERE id = :id"),
            {"id": operacao_id}
        )

        return {
            "mensagem": "OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o restaurada",
            "operacao_id": operacao_id,
            "nome": operacao[1]
        }


@app.put("/operacoes/{operacao_id}/encerrar")
def encerrar_operacao(operacao_id: int):
    with engine.begin() as conn:
        operacao = conn.execute(text("SELECT id, nome, estado FROM operacoes WHERE id = :id"), {"id": operacao_id}).fetchone()
        if not operacao:
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        if operacao[2] == "arquivada":
            raise HTTPException(status_code=409, detail="Uma operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o arquivada nÃƒÆ’Ã‚Â£o pode ser encerrada")
        conn.execute(text("UPDATE operacoes SET estado = 'concluida', data_fim = NOW() WHERE id = :id"), {"id": operacao_id})
        return {"mensagem": "OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o encerrada", "operacao_id": operacao_id, "nome": operacao[1]}


@app.put("/operacoes/{operacao_id}/reabrir")
def reabrir_operacao(operacao_id: int):
    with engine.begin() as conn:
        operacao = conn.execute(text("SELECT id, nome, estado FROM operacoes WHERE id = :id"), {"id": operacao_id}).fetchone()
        if not operacao:
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        if operacao[2] != "concluida":
            raise HTTPException(status_code=409, detail="A operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o estÃƒÆ’Ã‚Â¡ concluÃƒÆ’Ã‚Â­da")
        conn.execute(text("UPDATE operacoes SET estado = 'planeada', data_fim = NULL WHERE id = :id"), {"id": operacao_id})
        return {"mensagem": "OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o reaberta", "operacao_id": operacao_id, "nome": operacao[1]}


@app.put("/operacoes/{operacao_id}/arquivar")
def arquivar_operacao(operacao_id: int):
    with engine.begin() as conn:
        operacao = conn.execute(
            text("SELECT id, nome, estado FROM operacoes WHERE id = :id"),
            {"id": operacao_id}
        ).fetchone()

        if not operacao:
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")

        operacao_ativa_id = obter_operacao_ativa_id(conn)
        if operacao_ativa_id == operacao_id:
            raise HTTPException(
                status_code=409,
                detail="Feche a operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o antes de a arquivar"
            )

        conn.execute(
            text("UPDATE operacoes SET estado = 'arquivada' WHERE id = :id"),
            {"id": operacao_id}
        )

        return {
            "mensagem": "OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o arquivada",
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

    return {"mensagem": "OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o fechada"}

@app.get("/catalogo-recursos")
def listar_catalogo_recursos():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT rc.id, rc.nome, rc.tipo, rc.entidade_id,
                   e.nome AS entidade_nome, rc.ilha, rc.marca, rc.matricula, rc.estado, rc.criado_em
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
            INSERT INTO recursos_catalogo (nome, tipo, entidade_id, ilha, marca, matricula, estado)
            VALUES (:nome, :tipo, :entidade_id, :ilha, :marca, :matricula, :estado)
            ON CONFLICT (nome, tipo) DO UPDATE SET
                entidade_id = COALESCE(EXCLUDED.entidade_id, recursos_catalogo.entidade_id),
                ilha = COALESCE(EXCLUDED.ilha, recursos_catalogo.ilha),
                marca = COALESCE(EXCLUDED.marca, recursos_catalogo.marca),
                matricula = COALESCE(EXCLUDED.matricula, recursos_catalogo.matricula),
                estado = 'ativo'
            RETURNING id, nome, tipo, entidade_id, ilha, marca, matricula, estado, criado_em
        """), recurso.model_dump()).mappings().fetchone()
        return dict(novo)


@app.get("/operacoes/{operacao_id}/recursos-participantes")
def listar_recursos_participantes(operacao_id: int):
    with engine.connect() as conn:
        existe = conn.execute(text("SELECT id FROM operacoes WHERE id=:id"), {"id": operacao_id}).scalar()
        if not existe:
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        resultado = conn.execute(text("""
            SELECT opr.id AS participacao_id, opr.operacao_id,
                   rc.id AS recurso_catalogo_id, rc.nome, rc.tipo, rc.ilha, rc.marca, rc.matricula,
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
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        if operacao in ("concluida", "arquivada"):
            raise HTTPException(status_code=409, detail="A operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o permite alterar participantes")
        recurso = conn.execute(text("SELECT id FROM recursos_catalogo WHERE id=:id AND estado='ativo'"), {"id": dados.recurso_catalogo_id}).scalar()
        if recurso is None:
            raise HTTPException(status_code=404, detail="Recurso nÃƒÆ’Ã‚Â£o encontrado no catÃƒÆ’Ã‚Â¡logo")
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

        # Cria ou atualiza a representaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o operacional que aparece no mapa.
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
                            WHEN 'sÃƒÆ’Ã‚Â£o miguel' THEN -25.50 WHEN 'sao miguel' THEN -25.50
                            WHEN 'santa maria' THEN -25.10 WHEN 'terceira' THEN -27.22
                            WHEN 'graciosa' THEN -28.02 WHEN 'sÃƒÆ’Ã‚Â£o jorge' THEN -28.05
                            WHEN 'sao jorge' THEN -28.05 WHEN 'pico' THEN -28.32
                            WHEN 'faial' THEN -28.63 WHEN 'flores' THEN -31.20
                            WHEN 'corvo' THEN -31.11 ELSE -27.22 END,
                        CASE LOWER(COALESCE(rc.ilha, ''))
                            WHEN 'sÃƒÆ’Ã‚Â£o miguel' THEN 37.78 WHEN 'sao miguel' THEN 37.78
                            WHEN 'santa maria' THEN 36.97 WHEN 'terceira' THEN 38.66
                            WHEN 'graciosa' THEN 39.05 WHEN 'sÃƒÆ’Ã‚Â£o jorge' THEN 38.65
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

        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id)
            VALUES ('recurso', :descricao, :operacao_id)
        """), {"descricao": f"Recurso {dados.recurso_catalogo_id} preparado"
                           + (f" — indicativo {dados.indicativo_operacional}" if dados.indicativo_operacional else ""),
               "operacao_id": operacao_id})
        return {"mensagem": "Recurso adicionado ÃƒÆ’Ã‚Â  operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o", "participacao_id": participacao}


@app.delete("/operacoes/{operacao_id}/recursos-participantes/{recurso_catalogo_id}")
def retirar_recurso_participante(operacao_id: int, recurso_catalogo_id: int):
    with engine.begin() as conn:
        estado = conn.execute(text("SELECT estado FROM operacoes WHERE id=:id"), {"id": operacao_id}).scalar()
        if estado is None:
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        if estado in ("concluida", "arquivada"):
            raise HTTPException(status_code=409, detail="A operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o permite alterar participantes")
        em_ocorrencia = conn.execute(text("""
            SELECT 1 FROM recursos WHERE operacao_id=:operacao_id
              AND recurso_catalogo_id=:recurso_catalogo_id AND ocorrencia_id IS NOT NULL
        """), {"operacao_id": operacao_id, "recurso_catalogo_id": recurso_catalogo_id}).scalar()
        if em_ocorrencia:
            raise HTTPException(status_code=409, detail="Liberte primeiro a viatura da ocorrência")
        em_missao = conn.execute(text("""
            SELECT 1 FROM recursos r JOIN missao_recursos mr ON mr.recurso_id=r.id
            JOIN missoes m ON m.id=mr.missao_id AND m.operacao_id=r.operacao_id
            WHERE r.operacao_id=:operacao_id AND r.recurso_catalogo_id=:recurso_catalogo_id
              AND m.estado='em_execucao' LIMIT 1
        """), {"operacao_id": operacao_id, "recurso_catalogo_id": recurso_catalogo_id}).scalar()
        if em_missao:
            raise HTTPException(status_code=409, detail="Retire primeiro a viatura da missão ativa")
        resultado = conn.execute(text("""
            UPDATE operacao_recursos
            SET saida_em = NOW(), estado = 'retirado'
            WHERE operacao_id = :operacao_id
              AND recurso_catalogo_id = :recurso_catalogo_id
              AND saida_em IS NULL
        """), {"operacao_id": operacao_id, "recurso_catalogo_id": recurso_catalogo_id})
        if resultado.rowcount == 0:
            raise HTTPException(status_code=404, detail="ParticipaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")

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

        return {"mensagem": "Recurso retirado da operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o"}


@app.get("/catalogo-elementos")
def listar_catalogo_elementos():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT id, nome, entidade, posto, estado, criado_em
            FROM elementos_catalogo
            WHERE estado = 'ativo'
            ORDER BY nome, entidade
        """))
        return [dict(linha._mapping) for linha in resultado]


@app.post("/catalogo-elementos")
def criar_elemento_catalogo(elemento: ElementoCatalogo):
    with engine.begin() as conn:
        novo = conn.execute(text("""
            INSERT INTO elementos_catalogo (nome, entidade, posto, estado)
            VALUES (:nome, :entidade, :posto, :estado)
            ON CONFLICT (nome, entidade) DO UPDATE SET
                posto = COALESCE(EXCLUDED.posto, elementos_catalogo.posto),
                estado = 'ativo'
            RETURNING id, nome, entidade, posto, estado, criado_em
        """), elemento.model_dump()).mappings().fetchone()
        return dict(novo)


@app.get("/operacoes/{operacao_id}/elementos-participantes")
def listar_elementos_participantes(operacao_id: int):
    with engine.connect() as conn:
        existe = conn.execute(text("SELECT id FROM operacoes WHERE id=:id"), {"id": operacao_id}).scalar()
        if not existe:
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        resultado = conn.execute(text("""
            SELECT ope.id AS participacao_id, ope.operacao_id,
                   ec.id AS elemento_catalogo_id, ec.nome, ec.entidade, ec.posto,
                   ope.indicativo_operacional, ope.funcao_operacional,
                   ope.recurso_catalogo_id, rc.nome AS recurso_nome,
                   rc.tipo AS recurso_tipo, opr.indicativo_operacional AS recurso_indicativo,
                   ope.estado, ope.entrada_em, ope.saida_em,
                   ope.chamado_em, ope.apresentado_em
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
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        if estado_operacao in ("concluida", "arquivada"):
            raise HTTPException(status_code=409, detail="A operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o permite alterar participantes")

        elemento = conn.execute(text("SELECT id FROM elementos_catalogo WHERE id=:id AND estado='ativo'"), {"id": dados.elemento_catalogo_id}).scalar()
        if elemento is None:
            raise HTTPException(status_code=404, detail="Elemento nÃƒÆ’Ã‚Â£o encontrado no catÃƒÆ’Ã‚Â¡logo")

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
                raise HTTPException(status_code=409, detail="A viatura selecionada nÃƒÆ’Ã‚Â£o participa nesta operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o")

        recurso_operacional = None
        if dados.recurso_catalogo_id is not None:
            recurso_operacional = conn.execute(text("""
                SELECT id, nome, ocorrencia_id FROM recursos
                WHERE operacao_id=:operacao_id AND recurso_catalogo_id=:recurso_catalogo_id
                ORDER BY id LIMIT 1 FOR UPDATE
            """), {"operacao_id": operacao_id, "recurso_catalogo_id": dados.recurso_catalogo_id}).mappings().first()
            if not recurso_operacional:
                raise HTTPException(status_code=409, detail="A viatura selecionada não está disponível nesta operação")

        elemento_atual = conn.execute(text("""
            SELECT id, ocorrencia_id FROM elementos
            WHERE operacao_id=:operacao_id AND elemento_catalogo_id=:elemento_catalogo_id
            FOR UPDATE
        """), {"operacao_id": operacao_id, "elemento_catalogo_id": dados.elemento_catalogo_id}).mappings().first()
        if elemento_atual and elemento_atual["ocorrencia_id"] is not None:
            raise HTTPException(status_code=409, detail="Liberte o elemento da ocorrência antes de alterar a sua preparação")

        recurso_id = recurso_operacional["id"] if recurso_operacional else None
        ocorrencia_id = recurso_operacional["ocorrencia_id"] if recurso_operacional else None

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
                   :recurso_id, :ocorrencia_id, NULL, :operacao_id, ec.id
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
            "recurso_catalogo_id": dados.recurso_catalogo_id,
            "recurso_id": recurso_id, "ocorrencia_id": ocorrencia_id
        })

        conn.execute(text("""
            UPDATE elementos e
            SET nome = ec.nome, entidade = ec.entidade,
                indicativo_radio = ope.indicativo_operacional,
                funcao = ope.funcao_operacional,
                estado = CASE WHEN ope.recurso_catalogo_id IS NULL THEN 'disponivel' ELSE 'embarcado' END,
                recurso_id = :recurso_id,
                ocorrencia_id = :ocorrencia_id,
                localizacao = CASE WHEN :recurso_id IS NOT NULL THEN NULL ELSE e.localizacao END
            FROM operacao_elementos ope
            JOIN elementos_catalogo ec ON ec.id = ope.elemento_catalogo_id
            WHERE e.operacao_id = ope.operacao_id
              AND e.elemento_catalogo_id = ec.id
              AND e.ocorrencia_id IS NULL
              AND ope.operacao_id = :operacao_id
              AND ope.elemento_catalogo_id = :elemento_catalogo_id
        """), {"operacao_id": operacao_id, "elemento_catalogo_id": dados.elemento_catalogo_id,
               "recurso_id": recurso_id, "ocorrencia_id": ocorrencia_id})

        if ocorrencia_id is not None:
            conn.execute(text("""
                INSERT INTO elemento_empenhos (operacao_id, elemento_id, recurso_id, ocorrencia_id)
                SELECT :operacao_id, id, :recurso_id, :ocorrencia_id FROM elementos
                WHERE operacao_id=:operacao_id AND elemento_catalogo_id=:elemento_catalogo_id
                ON CONFLICT (operacao_id, elemento_id) WHERE fim_em IS NULL DO NOTHING
            """), {"operacao_id": operacao_id, "elemento_catalogo_id": dados.elemento_catalogo_id,
                   "recurso_id": recurso_id, "ocorrencia_id": ocorrencia_id})

        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, elemento_id, recurso_id, ocorrencia_id, operacao_id)
            VALUES ('elemento', :descricao,
                    (SELECT id FROM elementos WHERE operacao_id=:operacao_id
                     AND elemento_catalogo_id=:elemento_catalogo_id),
                    :recurso_id, :ocorrencia_id, :operacao_id)
        """), {"descricao": f"Preparação do elemento {dados.elemento_catalogo_id} atualizada"
                           + (f" na viatura {recurso_operacional['nome']}" if recurso_operacional else " sem viatura"),
               "elemento_catalogo_id": dados.elemento_catalogo_id,
               "recurso_id": recurso_id, "ocorrencia_id": ocorrencia_id, "operacao_id": operacao_id})
        return {"mensagem": "Elemento adicionado ÃƒÆ’Ã‚Â  operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o"}


class HorariosElemento(BaseModel):
    chamado_em: datetime | None = None
    apresentado_em: datetime | None = None


@app.put("/operacoes/{operacao_id}/elementos-participantes/{elemento_catalogo_id}/horarios")
def registar_horarios_elemento(operacao_id: int, elemento_catalogo_id: int, dados: HorariosElemento):
    if dados.chamado_em is None and dados.apresentado_em is None:
        raise HTTPException(status_code=400, detail="Indique a hora da chamada ou da apresentação")
    with engine.begin() as conn:
        if exigir_operacao_editavel_id(conn) != operacao_id:
            raise HTTPException(status_code=409, detail="Esta não é a operação ativa")
        participante = conn.execute(text("""
            UPDATE operacao_elementos
            SET chamado_em=COALESCE(:chamado_em, chamado_em),
                apresentado_em=COALESCE(:apresentado_em, apresentado_em)
            WHERE operacao_id=:operacao_id AND elemento_catalogo_id=:elemento_catalogo_id
              AND saida_em IS NULL
            RETURNING id
        """), {"chamado_em": hora_operacional(dados.chamado_em) if dados.chamado_em else None,
               "apresentado_em": hora_operacional(dados.apresentado_em) if dados.apresentado_em else None,
               "operacao_id": operacao_id, "elemento_catalogo_id": elemento_catalogo_id}).scalar()
        if not participante:
            raise HTTPException(status_code=404, detail="Elemento não encontrado nesta operação")
        nome = conn.execute(text("SELECT nome FROM elementos_catalogo WHERE id=:id"),
                            {"id": elemento_catalogo_id}).scalar()
        for tipo, valor in (("Chamado", dados.chamado_em), ("Apresentou-se", dados.apresentado_em)):
            if valor is None:
                continue
            conn.execute(text("""
                INSERT INTO timeline_eventos (tipo, descricao, operacao_id, criado_em)
                VALUES ('elemento', :descricao, :operacao_id, :hora)
            """), {"descricao": f"{nome}: {tipo.lower()} ao serviço",
                   "operacao_id": operacao_id, "hora": hora_operacional(valor)})
    return {"mensagem": "Horários do elemento registados"}


@app.delete("/operacoes/{operacao_id}/elementos-participantes/{elemento_catalogo_id}")
def retirar_elemento_participante(operacao_id: int, elemento_catalogo_id: int):
    with engine.begin() as conn:
        estado_operacao = conn.execute(text("SELECT estado FROM operacoes WHERE id=:id"), {"id": operacao_id}).scalar()
        if estado_operacao is None:
            raise HTTPException(status_code=404, detail="OperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        if estado_operacao in ("concluida", "arquivada"):
            raise HTTPException(status_code=409, detail="A operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o permite alterar participantes")
        em_servico = conn.execute(text("""
            SELECT 1 FROM elementos WHERE operacao_id=:operacao_id
              AND elemento_catalogo_id=:elemento_catalogo_id AND ocorrencia_id IS NOT NULL
        """), {"operacao_id": operacao_id, "elemento_catalogo_id": elemento_catalogo_id}).scalar()
        if em_servico:
            raise HTTPException(status_code=409, detail="Liberte o elemento da ocorrência antes de o retirar")

        resultado = conn.execute(text("""
            UPDATE operacao_elementos
            SET estado = 'retirado', saida_em = NOW()
            WHERE operacao_id = :operacao_id
              AND elemento_catalogo_id = :elemento_catalogo_id
              AND saida_em IS NULL
        """), {"operacao_id": operacao_id, "elemento_catalogo_id": elemento_catalogo_id})
        if resultado.rowcount == 0:
            raise HTTPException(status_code=404, detail="ParticipaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")

        conn.execute(text("""
            UPDATE elementos SET estado='retirado', recurso_id=NULL
            WHERE operacao_id = :operacao_id
              AND elemento_catalogo_id = :elemento_catalogo_id
        """), {"operacao_id": operacao_id, "elemento_catalogo_id": elemento_catalogo_id})
        return {"mensagem": "Elemento retirado da operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o"}


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

    return {"mensagem": "Recurso criado e adicionado ÃƒÆ’Ã‚Â  operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o"}


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
    titulo = ocorrencia.titulo.strip()
    if not titulo:
        raise HTTPException(status_code=400, detail="A ocorrência precisa de um título")
    recebido_em = hora_operacional(ocorrencia.recebida_em)
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        nova = conn.execute(text("""
            INSERT INTO ocorrencias (
                titulo, descricao, tipo, estado, ilha, localizacao,
                operacao_id, recebida_em
            ) VALUES (
                :titulo, :descricao, :tipo, 'recebida', :ilha,
                ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
                :operacao_id, :recebido_em
            )
            RETURNING id
        """), {
            "titulo": titulo, "descricao": ocorrencia.descricao,
            "tipo": ocorrencia.tipo, "ilha": ocorrencia.ilha,
            "latitude": ocorrencia.latitude, "longitude": ocorrencia.longitude,
            "operacao_id": operacao_id, "recebido_em": recebido_em
        }).scalar_one()
        conn.execute(text("""
            INSERT INTO chamadas_ocorrencia
                (operacao_id, ocorrencia_id, recebido_em, origem, contacto, informacao)
            VALUES (:operacao_id, :ocorrencia_id, :recebido_em, :origem, :contacto, :informacao)
        """), {"operacao_id": operacao_id, "ocorrencia_id": nova, "recebido_em": recebido_em,
               "origem": (ocorrencia.origem_chamada or "").strip() or None,
               "contacto": (ocorrencia.contacto_chamada or "").strip() or None,
               "informacao": (ocorrencia.descricao or "").strip() or titulo})
        conn.execute(text("""
            UPDATE operacoes SET data_inicio=COALESCE(data_inicio, :recebido_em)
            WHERE id=:operacao_id
              AND NOT EXISTS (SELECT 1 FROM ocorrencias
                              WHERE operacao_id=:operacao_id AND id<>:ocorrencia_id)
        """), {"recebido_em": recebido_em, "operacao_id": operacao_id, "ocorrencia_id": nova})
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, ocorrencia_id, operacao_id, criado_em)
            VALUES ('chamada', :descricao, :ocorrencia_id, :operacao_id, :recebido_em)
        """), {
            "descricao": f"Chamada recebida — {titulo}: {(ocorrencia.descricao or '').strip()}"
                         + (f" | Origem: {ocorrencia.origem_chamada.strip()}" if ocorrencia.origem_chamada and ocorrencia.origem_chamada.strip() else ""),
            "ocorrencia_id": nova, "operacao_id": operacao_id, "recebido_em": recebido_em
        })
    return {"mensagem": "Ocorrência e chamada registadas", "id": nova}


@app.get("/ocorrencias/{ocorrencia_id}/chamadas")
def listar_chamadas_ocorrencia(ocorrencia_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        existe = conn.execute(text("SELECT id FROM ocorrencias WHERE id=:id AND operacao_id=:operacao_id"),
                              {"id": ocorrencia_id, "operacao_id": operacao_id}).scalar()
        if existe is None:
            raise HTTPException(status_code=404, detail="Ocorrência não encontrada")
        linhas = conn.execute(text("""
            SELECT id, recebido_em, origem, contacto, informacao, registado_em
            FROM chamadas_ocorrencia
            WHERE operacao_id=:operacao_id AND ocorrencia_id=:ocorrencia_id
            ORDER BY recebido_em, id
        """), {"operacao_id": operacao_id, "ocorrencia_id": ocorrencia_id})
        return [dict(linha._mapping) for linha in linhas]


@app.post("/ocorrencias/{ocorrencia_id}/chamadas")
def registar_chamada_ocorrencia(ocorrencia_id: int, dados: ChamadaOcorrencia):
    informacao = dados.informacao.strip()
    if not informacao:
        raise HTTPException(status_code=400, detail="Indique a informação recebida na chamada")
    recebido_em = hora_operacional(dados.recebido_em)
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        existe = conn.execute(text("SELECT id FROM ocorrencias WHERE id=:id AND operacao_id=:operacao_id"),
                              {"id": ocorrencia_id, "operacao_id": operacao_id}).scalar()
        if existe is None:
            raise HTTPException(status_code=404, detail="Ocorrência não encontrada")
        chamada_id = conn.execute(text("""
            INSERT INTO chamadas_ocorrencia
                (operacao_id, ocorrencia_id, recebido_em, origem, contacto, informacao)
            VALUES (:operacao_id, :ocorrencia_id, :recebido_em, :origem, :contacto, :informacao)
            RETURNING id
        """), {"operacao_id": operacao_id, "ocorrencia_id": ocorrencia_id,
               "recebido_em": recebido_em, "origem": (dados.origem or "").strip() or None,
               "contacto": (dados.contacto or "").strip() or None, "informacao": informacao}).scalar_one()
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, ocorrencia_id, operacao_id, criado_em)
            VALUES ('chamada', :descricao, :ocorrencia_id, :operacao_id, :recebido_em)
        """), {"descricao": f"Chamada recebida: {informacao}"
                         + (f" | Origem: {dados.origem.strip()}" if dados.origem and dados.origem.strip() else ""),
               "ocorrencia_id": ocorrencia_id, "operacao_id": operacao_id,
               "recebido_em": recebido_em})
    return {"mensagem": "Chamada registada", "id": chamada_id}


ESTADOS_OCORRENCIA = ["recebida", "em_curso", "sob_controlo", "encerrada", "arquivada"]
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
        raise HTTPException(status_code=400, detail="Estado de ocorrÃƒÆ’Ã‚Âªncia invÃƒÆ’Ã‚Â¡lido")
    atual = conn.execute(text("""
        SELECT titulo, estado FROM ocorrencias
        WHERE id=:id AND operacao_id=:operacao_id
    """), {"id": ocorrencia_id, "operacao_id": operacao_id}).fetchone()
    if not atual:
        raise HTTPException(status_code=404, detail="OcorrÃƒÆ’Ã‚Âªncia nÃƒÆ’Ã‚Â£o encontrada")
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
    return {"mensagem": "Estado da ocorrÃƒÆ’Ã‚Âªncia atualizado"}


@app.get("/ocorrencias/{ocorrencia_id}/timeline")
def timeline_ocorrencia(ocorrencia_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        resultado = conn.execute(text("""
            SELECT id, tipo, descricao, recurso_id, elemento_id, ocorrencia_id, criado_em
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
            raise HTTPException(status_code=404, detail="OcorrÃƒÆ’Ã‚Âªncia nÃƒÆ’Ã‚Â£o encontrada")
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
            "tempo_resposta_segundos": segundos(recebida, primeira_chegada),
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
            SELECT id, tipo, descricao, recurso_id, elemento_id, ocorrencia_id, criado_em
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
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)

        recurso = conn.execute(text("""
            SELECT nome, indicativo_radio, estado, ocorrencia_id
            FROM recursos
            WHERE id = :recurso_id
              AND operacao_id = :operacao_id
        """), {
            "recurso_id": recurso_id,
            "operacao_id": operacao_id
        }).fetchone()

        if not recurso:
            raise HTTPException(
                status_code=404,
                detail="Recurso nÃƒÂ£o encontrado nesta operaÃƒÂ§ÃƒÂ£o"
            )

        estado_anterior = recurso[2]
        novo_estado = dados["estado"]
        ocorrencia_id = recurso[3]
        nome = recurso[1] or recurso[0]

        # Ao terminar um empenhamento atravÃƒÂ©s de "Marcar disponÃƒÂ­vel",
        # regista a libertaÃƒÂ§ÃƒÂ£o antes de retirar a associaÃƒÂ§ÃƒÂ£o ÃƒÂ  ocorrÃƒÂªncia.
        # Este evento fecha o perÃƒÂ­odo usado no cÃƒÂ¡lculo do tempo empenhado.
        if (
            estado_anterior != "disponivel"
            and novo_estado == "disponivel"
            and ocorrencia_id is not None
        ):
            conn.execute(text("""
                UPDATE elemento_empenhos ee SET fim_em=NOW()
                FROM elementos e WHERE ee.elemento_id=e.id AND ee.operacao_id=:operacao_id
                  AND ee.recurso_id=:recurso_id AND ee.fim_em IS NULL
                  AND e.recurso_id=:recurso_id
            """), {"recurso_id": recurso_id, "operacao_id": operacao_id})
            conn.execute(text("""
                UPDATE elementos SET ocorrencia_id=NULL
                WHERE operacao_id=:operacao_id AND recurso_id=:recurso_id
            """), {"recurso_id": recurso_id, "operacao_id": operacao_id})
            conn.execute(text("""
                INSERT INTO timeline_eventos (
                    tipo, descricao, recurso_id, ocorrencia_id, operacao_id
                )
                VALUES (
                    'recurso', :descricao, :recurso_id,
                    :ocorrencia_id, :operacao_id
                )
            """), {
                "descricao": f"Recurso libertado: {nome}",
                "recurso_id": recurso_id,
                "ocorrencia_id": ocorrencia_id,
                "operacao_id": operacao_id
            })

        conn.execute(text("""
            UPDATE recursos
            SET estado = :estado,
                ocorrencia_id = CASE
                    WHEN :estado = 'disponivel' THEN NULL
                    ELSE ocorrencia_id
                END
            WHERE id = :recurso_id
              AND operacao_id = :operacao_id
        """), {
            "estado": novo_estado,
            "recurso_id": recurso_id,
            "operacao_id": operacao_id
        })

        conn.execute(text("""
            INSERT INTO timeline_eventos (
                tipo, descricao, recurso_id, ocorrencia_id, operacao_id
            )
            VALUES (
                'estado', :descricao, :recurso_id,
                :ocorrencia_id, :operacao_id
            )
        """), {
            "descricao": f"Recurso {nome} mudou estado para {novo_estado}",
            "recurso_id": recurso_id,
            "ocorrencia_id": ocorrencia_id,
            "operacao_id": operacao_id
        })

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
            raise HTTPException(status_code=404, detail="Recurso nÃƒÆ’Ã‚Â£o encontrado nesta operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o")

        conn.execute(text("""
            UPDATE elemento_empenhos ee SET fim_em=NOW()
            FROM elementos e WHERE ee.elemento_id=e.id AND ee.operacao_id=:operacao_id
              AND ee.recurso_id=:recurso_id AND ee.fim_em IS NULL
              AND e.recurso_id=:recurso_id
        """), {"recurso_id": recurso_id, "operacao_id": operacao_id})
        conn.execute(text("""
            UPDATE elementos SET ocorrencia_id=NULL
            WHERE operacao_id=:operacao_id AND recurso_id=:recurso_id
        """), {"recurso_id": recurso_id, "operacao_id": operacao_id})
        conn.execute(text("""
            UPDATE recursos
            SET estado = CASE WHEN EXISTS (
                SELECT 1 FROM missao_recursos mr JOIN missoes m ON m.id=mr.missao_id
                WHERE mr.recurso_id=:recurso_id AND m.operacao_id=:operacao_id
                  AND m.estado='em_execucao'
            ) THEN 'em_missao' ELSE 'disponivel' END, ocorrencia_id = NULL
            WHERE id = :recurso_id AND operacao_id = :operacao_id
        """), {"recurso_id": recurso_id, "operacao_id": operacao_id})

        nome = recurso[1] or recurso[0]
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, recurso_id, ocorrencia_id, operacao_id)
            VALUES ('recurso', :descricao, :recurso_id, :ocorrencia_id, :operacao_id)
        """), {
            "descricao": f"Recurso libertado: {nome}",
            "recurso_id": recurso_id,
            "ocorrencia_id": recurso[2],
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

    return {"mensagem": "Posi??o atualizada"}

@app.put("/recursos/{recurso_id}/confirmar-chegada")
def confirmar_chegada(recurso_id: int):
    with engine.begin() as conn:
        recurso = conn.execute(
            text("""
                SELECT r.nome, r.indicativo_radio, r.ocorrencia_id, o.titulo
                FROM recursos r
                LEFT JOIN ocorrencias o ON o.id = r.ocorrencia_id
                WHERE r.id = :id AND r.operacao_id = :operacao_id
            """),
            {"id": recurso_id, "operacao_id": exigir_operacao_editavel_id(conn)}
        ).fetchone()

        if not recurso:
            raise HTTPException(status_code=404, detail="Recurso não encontrado nesta operação")

        nome_recurso = recurso[0]
        indicativo = recurso[1] or ""
        ocorrencia_id = recurso[2]
        titulo_ocorrencia = recurso[3]

        if not ocorrencia_id:
            raise HTTPException(status_code=409, detail="O recurso não tem ocorrência associada")

        texto_recurso = f"{nome_recurso} ({indicativo})" if indicativo else nome_recurso

        chegada_existente = conn.execute(
            text("""
                SELECT id
                FROM timeline_eventos
                WHERE tipo = 'chegada'
                AND recurso_id = :recurso_id
                AND ocorrencia_id = :ocorrencia_id
                AND operacao_id = :operacao_id
                AND criado_em >= (
                    SELECT MAX(criado_em) FROM ordens
                    WHERE recurso_id=:recurso_id AND ocorrencia_id=:ocorrencia_id
                      AND operacao_id=:operacao_id AND titulo LIKE 'Desloca%'
                )
                LIMIT 1
            """),
            {
                "recurso_id": recurso_id,
                "ocorrencia_id": ocorrencia_id,
                "operacao_id": exigir_operacao_ativa_id(conn)
            }
        ).fetchone()

        if chegada_existente:
            return {"mensagem": "Chegada j\u00e1 registada"}

        conn.execute(
            text("""
                INSERT INTO timeline_eventos (tipo, descricao, recurso_id, ocorrencia_id, operacao_id)
                VALUES ('chegada', :descricao, :recurso_id, :ocorrencia_id, (SELECT CAST(valor AS INTEGER) FROM configuracao WHERE chave='operacao_ativa'))
            """),
            {
                "descricao": f"Chegada ao local: {texto_recurso} chegou \u00e0 ocorr\u00eancia {titulo_ocorrencia}",
                "recurso_id": recurso_id,
                "ocorrencia_id": ocorrencia_id
            }
        )

        estado_ocorrencia = conn.execute(text("SELECT estado FROM ocorrencias WHERE id=:id"), {"id": ocorrencia_id}).scalar()
        if estado_ocorrencia == "recebida":
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
                AND titulo LIKE 'Desloca%'
                AND operacao_id = :operacao_id
            """),
            {
                "recurso_id": recurso_id,
                "ocorrencia_id": ocorrencia_id,
                "operacao_id": exigir_operacao_ativa_id(conn)
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
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        recurso = conn.execute(text("""
            SELECT nome, indicativo_radio, estado, ocorrencia_id FROM recursos
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": recurso_id, "operacao_id": operacao_id}).mappings().first()
        ocorrencia = conn.execute(text("""
            SELECT titulo, estado FROM ocorrencias
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": ocorrencia_id, "operacao_id": operacao_id}).mappings().first()
        if not recurso or not ocorrencia:
            raise HTTPException(status_code=404, detail="Recurso ou ocorrência não encontrado nesta operação")
        if recurso["estado"] not in {"disponivel", "em_missao"} or recurso["ocorrencia_id"] is not None:
            raise HTTPException(status_code=409, detail="O recurso já está afetado a uma ocorrência")
        if ocorrencia["estado"] in {"encerrada", "arquivada"}:
            raise HTTPException(status_code=409, detail="A ocorrência já foi encerrada")
        nome = recurso["indicativo_radio"] or recurso["nome"]
        conn.execute(text("""
            UPDATE ocorrencias SET despachada_em=COALESCE(despachada_em, NOW())
            WHERE id=:ocorrencia_id AND operacao_id=:operacao_id
        """), {"ocorrencia_id": ocorrencia_id, "operacao_id": operacao_id})
        conn.execute(text("""
            UPDATE recursos SET ocorrencia_id=:ocorrencia_id, estado='em_missao'
            WHERE id=:recurso_id AND operacao_id=:operacao_id
        """), {"ocorrencia_id": ocorrencia_id, "recurso_id": recurso_id, "operacao_id": operacao_id})
        conn.execute(text("""
            INSERT INTO ordens (titulo, descricao, estado, recurso_id, ocorrencia_id, operacao_id)
            VALUES ('Deslocação para ocorrência', :descricao, 'emitida',
                    :recurso_id, :ocorrencia_id, :operacao_id)
        """), {"descricao": f"{nome}: deslocar para {ocorrencia['titulo']}",
               "recurso_id": recurso_id, "ocorrencia_id": ocorrencia_id, "operacao_id": operacao_id})
        membros = conn.execute(text("""
            UPDATE elementos SET ocorrencia_id=:ocorrencia_id
            WHERE operacao_id=:operacao_id AND recurso_id=:recurso_id
            RETURNING id, nome
        """), {"ocorrencia_id": ocorrencia_id, "operacao_id": operacao_id,
               "recurso_id": recurso_id}).mappings().all()
        for membro in membros:
            conn.execute(text("""
                INSERT INTO elemento_empenhos (operacao_id, elemento_id, recurso_id, ocorrencia_id)
                VALUES (:operacao_id, :elemento_id, :recurso_id, :ocorrencia_id)
                ON CONFLICT (operacao_id, elemento_id) WHERE fim_em IS NULL DO NOTHING
            """), {"operacao_id": operacao_id, "elemento_id": membro["id"],
                   "recurso_id": recurso_id, "ocorrencia_id": ocorrencia_id})
            conn.execute(text("""
                INSERT INTO timeline_eventos (tipo, descricao, recurso_id, ocorrencia_id, operacao_id)
                VALUES ('elemento', :descricao, :recurso_id, :ocorrencia_id, :operacao_id)
            """), {"descricao": f"{membro['nome']} mobilizado na equipa {nome}",
                   "recurso_id": recurso_id, "ocorrencia_id": ocorrencia_id,
                   "operacao_id": operacao_id})
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, recurso_id, ocorrencia_id, operacao_id)
            VALUES ('ordem', :descricao, :recurso_id, :ocorrencia_id, :operacao_id)
        """), {"descricao": f"Ordem de deslocação para {nome}: {ocorrencia['titulo']}",
               "recurso_id": recurso_id, "ocorrencia_id": ocorrencia_id, "operacao_id": operacao_id})
    return {"mensagem": "Ordem de deslocação criada"}


@app.put("/elementos/{elemento_id}/atribuir-ocorrencia/{ocorrencia_id}")
def atribuir_elemento_ocorrencia(elemento_id: int, ocorrencia_id: int):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        elemento = conn.execute(text("""
            SELECT nome, estado, recurso_id, ocorrencia_id FROM elementos
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": elemento_id, "operacao_id": operacao_id}).mappings().first()
        ocorrencia = conn.execute(text("""
            SELECT titulo, estado FROM ocorrencias
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": ocorrencia_id, "operacao_id": operacao_id}).mappings().first()
        if not elemento or not ocorrencia:
            raise HTTPException(status_code=404, detail="Elemento ou ocorrência não encontrado")
        if elemento["recurso_id"] is not None or elemento["ocorrencia_id"] is not None:
            raise HTTPException(status_code=409, detail="O elemento já está integrado numa equipa ou ocorrência")
        if elemento["estado"] not in {"disponivel", "apeado"}:
            raise HTTPException(status_code=409, detail="O elemento não está disponível")
        if ocorrencia["estado"] in {"encerrada", "arquivada"}:
            raise HTTPException(status_code=409, detail="A ocorrência está encerrada")
        conn.execute(text("""
            UPDATE elementos SET ocorrencia_id=:ocorrencia_id, estado='em_missao'
            WHERE id=:elemento_id AND operacao_id=:operacao_id
        """), {"ocorrencia_id": ocorrencia_id, "elemento_id": elemento_id,
               "operacao_id": operacao_id})
        conn.execute(text("""
            UPDATE ocorrencias SET despachada_em=COALESCE(despachada_em, NOW())
            WHERE id=:ocorrencia_id AND operacao_id=:operacao_id
        """), {"ocorrencia_id": ocorrencia_id, "operacao_id": operacao_id})
        conn.execute(text("""
            INSERT INTO elemento_empenhos (operacao_id, elemento_id, ocorrencia_id)
            VALUES (:operacao_id, :elemento_id, :ocorrencia_id)
        """), {"operacao_id": operacao_id, "elemento_id": elemento_id,
               "ocorrencia_id": ocorrencia_id})
        conn.execute(text("""
            INSERT INTO ordens (titulo, descricao, estado, elemento_id, ocorrencia_id, operacao_id)
            VALUES ('Deslocação para ocorrência', :descricao, 'emitida',
                    :elemento_id, :ocorrencia_id, :operacao_id)
        """), {"descricao": f"{elemento['nome']}: deslocar para {ocorrencia['titulo']}",
               "elemento_id": elemento_id, "ocorrencia_id": ocorrencia_id,
               "operacao_id": operacao_id})
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, elemento_id, ocorrencia_id, operacao_id)
            VALUES ('ordem', :descricao, :elemento_id, :ocorrencia_id, :operacao_id)
        """), {"descricao": f"Ordem de deslocação para {elemento['nome']}: {ocorrencia['titulo']}",
               "elemento_id": elemento_id, "ocorrencia_id": ocorrencia_id,
               "operacao_id": operacao_id})
    return {"mensagem": "Ordem de deslocação do elemento criada"}


@app.put("/elementos/{elemento_id}/confirmar-chegada")
def confirmar_chegada_elemento(elemento_id: int):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        elemento = conn.execute(text("""
            SELECT nome, ocorrencia_id FROM elementos
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": elemento_id, "operacao_id": operacao_id}).mappings().first()
        if not elemento or elemento["ocorrencia_id"] is None:
            raise HTTPException(status_code=409, detail="O elemento não tem ocorrência associada")
        ocorrencia_id = elemento["ocorrencia_id"]
        existe = conn.execute(text("""
            SELECT id FROM timeline_eventos WHERE tipo='chegada' AND elemento_id=:elemento_id
              AND ocorrencia_id=:ocorrencia_id AND operacao_id=:operacao_id
              AND criado_em >= (
                  SELECT MAX(criado_em) FROM ordens
                  WHERE elemento_id=:elemento_id AND ocorrencia_id=:ocorrencia_id
                    AND operacao_id=:operacao_id AND titulo LIKE 'Desloca%'
              ) LIMIT 1
        """), {"elemento_id": elemento_id, "ocorrencia_id": ocorrencia_id,
               "operacao_id": operacao_id}).scalar()
        if existe:
            return {"mensagem": "Chegada já registada"}
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, elemento_id, ocorrencia_id, operacao_id)
            VALUES ('chegada', :descricao, :elemento_id, :ocorrencia_id, :operacao_id)
        """), {"descricao": f"Chegada ao local: {elemento['nome']}", "elemento_id": elemento_id,
               "ocorrencia_id": ocorrencia_id, "operacao_id": operacao_id})
        conn.execute(text("""
            UPDATE ordens SET estado='executada'
            WHERE elemento_id=:elemento_id AND ocorrencia_id=:ocorrencia_id
              AND operacao_id=:operacao_id AND estado='emitida' AND titulo LIKE 'Desloca%'
        """), {"elemento_id": elemento_id, "ocorrencia_id": ocorrencia_id,
               "operacao_id": operacao_id})
        estado = conn.execute(text("SELECT estado FROM ocorrencias WHERE id=:id AND operacao_id=:operacao_id"),
                              {"id": ocorrencia_id, "operacao_id": operacao_id}).scalar()
        if estado == "recebida":
            atualizar_estado_ocorrencia_interno(conn, ocorrencia_id, "em_curso", operacao_id)
    return {"mensagem": "Chegada do elemento registada"}


class ComunicacaoSituacao(BaseModel):
    recurso_id: int | None = None
    elemento_id: int | None = None
    descricao: str


@app.post("/ocorrencias/{ocorrencia_id}/situacao")
def comunicar_situacao(ocorrencia_id: int, dados: ComunicacaoSituacao):
    descricao = dados.descricao.strip()
    if not descricao:
        raise HTTPException(status_code=400, detail="A informação da situação é obrigatória")
    if (dados.recurso_id is None) == (dados.elemento_id is None):
        raise HTTPException(status_code=400, detail="Indique um recurso ou um elemento")
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        tabela, alvo_id = ("recursos", dados.recurso_id) if dados.recurso_id is not None else ("elementos", dados.elemento_id)
        coluna = "recurso_id" if dados.recurso_id is not None else "elemento_id"
        recurso = conn.execute(text(f"""
            SELECT nome{', indicativo_radio' if tabela == 'recursos' else ''} FROM {tabela}
            WHERE id=:alvo_id AND operacao_id=:operacao_id AND ocorrencia_id=:ocorrencia_id
        """), {"alvo_id": alvo_id, "operacao_id": operacao_id,
               "ocorrencia_id": ocorrencia_id}).mappings().first()
        if recurso is None:
            raise HTTPException(status_code=409, detail="O destinatário não está associado a esta ocorrência")
        chegada = conn.execute(text("""
            SELECT id FROM timeline_eventos
            WHERE tipo='chegada' AND recurso_id IS NOT DISTINCT FROM :recurso_id
              AND elemento_id IS NOT DISTINCT FROM :elemento_id
              AND ocorrencia_id=:ocorrencia_id AND operacao_id=:operacao_id
              AND criado_em >= (
                  SELECT MAX(criado_em) FROM ordens
                  WHERE recurso_id IS NOT DISTINCT FROM :recurso_id
                    AND elemento_id IS NOT DISTINCT FROM :elemento_id
                    AND ocorrencia_id=:ocorrencia_id AND operacao_id=:operacao_id
                    AND titulo LIKE 'Desloca%'
              )
            LIMIT 1
        """), {"recurso_id": dados.recurso_id, "elemento_id": dados.elemento_id, "ocorrencia_id": ocorrencia_id,
               "operacao_id": operacao_id}).scalar()
        if not chegada:
            raise HTTPException(status_code=409, detail="Confirme primeiro a chegada ao local")
        nome = (recurso["indicativo_radio"] if tabela == 'recursos' else None) or recurso["nome"]
        evento_id = conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, recurso_id, elemento_id, ocorrencia_id, operacao_id)
            VALUES ('situacao', :descricao, :recurso_id, :elemento_id, :ocorrencia_id, :operacao_id)
            RETURNING id
        """), {"descricao": f"Situação comunicada por {nome}: {descricao}",
               "recurso_id": dados.recurso_id, "elemento_id": dados.elemento_id, "ocorrencia_id": ocorrencia_id,
               "operacao_id": operacao_id}).scalar_one()
    return {"mensagem": "Situação registada", "id": evento_id}


@app.get("/ordens")
def listar_ordens():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT id, titulo, descricao, estado, recurso_id, elemento_id, ocorrencia_id, criado_em
            FROM ordens
            WHERE operacao_id = :operacao_id
            ORDER BY criado_em DESC, id DESC
        """), {"operacao_id": exigir_operacao_ativa_id(conn)})
        return [dict(linha._mapping) for linha in resultado]


class Ordem(BaseModel):
    titulo: str
    descricao: str = ""
    estado: str = "emitida"
    recurso_id: int | None = None
    elemento_id: int | None = None
    ocorrencia_id: int


@app.post("/ordens")
def criar_ordem(ordem: Ordem):
    titulo = ordem.titulo.strip()
    descricao = ordem.descricao.strip()
    if not titulo:
        raise HTTPException(status_code=400, detail="A ordem precisa de um título")
    if ordem.estado != "emitida":
        raise HTTPException(status_code=400, detail="Uma nova ordem começa no estado emitida")
    if (ordem.recurso_id is None) == (ordem.elemento_id is None):
        raise HTTPException(status_code=400, detail="Indique um recurso ou um elemento")
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        tabela, alvo_id = ("recursos", ordem.recurso_id) if ordem.recurso_id is not None else ("elementos", ordem.elemento_id)
        recurso = conn.execute(text(f"""
            SELECT nome{', indicativo_radio' if tabela == 'recursos' else ''} FROM {tabela}
            WHERE id=:alvo_id AND operacao_id=:operacao_id AND ocorrencia_id=:ocorrencia_id
        """), {"alvo_id": alvo_id, "ocorrencia_id": ordem.ocorrencia_id,
               "operacao_id": operacao_id}).mappings().first()
        if recurso is None:
            raise HTTPException(status_code=409, detail="Primeiro ordene a deslocação do destinatário para esta ocorrência")
        ordem_id = conn.execute(text("""
            INSERT INTO ordens (titulo, descricao, estado, recurso_id, elemento_id, ocorrencia_id, operacao_id)
            VALUES (:titulo, :descricao, 'emitida', :recurso_id, :elemento_id, :ocorrencia_id, :operacao_id)
            RETURNING id
        """), {"titulo": titulo, "descricao": descricao, "recurso_id": ordem.recurso_id, "elemento_id": ordem.elemento_id,
               "ocorrencia_id": ordem.ocorrencia_id, "operacao_id": operacao_id}).scalar_one()
        nome = (recurso["indicativo_radio"] if tabela == 'recursos' else None) or recurso["nome"]
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, recurso_id, elemento_id, ocorrencia_id, operacao_id)
            VALUES ('ordem', :descricao, :recurso_id, :elemento_id, :ocorrencia_id, :operacao_id)
        """), {"descricao": f"Ordem para {nome}: {titulo}" + (f" — {descricao}" if descricao else ""),
               "recurso_id": ordem.recurso_id, "elemento_id": ordem.elemento_id, "ocorrencia_id": ordem.ocorrencia_id,
               "operacao_id": operacao_id})
    return {"mensagem": "Ordem criada com sucesso", "id": ordem_id}


@app.put("/ordens/{ordem_id}/estado")
def atualizar_estado_ordem(ordem_id: int, dados: dict):
    estado = dados.get("estado")
    if estado not in {"emitida", "executada", "concluida"}:
        raise HTTPException(status_code=400, detail="Estado da ordem inválido")
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        ordem = conn.execute(text("""
            SELECT titulo, recurso_id, elemento_id, ocorrencia_id, estado
            FROM ordens WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": ordem_id, "operacao_id": operacao_id}).mappings().first()
        if not ordem:
            raise HTTPException(status_code=404, detail="Ordem não encontrada")
        if ordem["estado"] == estado:
            return {"mensagem": "Estado da ordem inalterado"}
        conn.execute(text("UPDATE ordens SET estado=:estado WHERE id=:id AND operacao_id=:operacao_id"),
                     {"estado": estado, "id": ordem_id, "operacao_id": operacao_id})
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, recurso_id, elemento_id, ocorrencia_id, operacao_id)
            VALUES ('ordem', :descricao, :recurso_id, :elemento_id, :ocorrencia_id, :operacao_id)
        """), {"descricao": f"Ordem {ordem['titulo']}: {estado}",
               "recurso_id": ordem["recurso_id"], "elemento_id": ordem["elemento_id"], "ocorrencia_id": ordem["ocorrencia_id"],
               "operacao_id": operacao_id})
    return {"mensagem": "Estado da ordem atualizado"}


@app.get("/missoes")
def listar_missoes():
    with engine.connect() as conn:
        resultado = conn.execute(text("""
            SELECT m.id, m.titulo, m.descricao, m.prioridade, m.estado, m.recurso_id,
                   m.ocorrencia_id, m.objetivo_id, m.responsavel, m.zona, m.notas, m.situacao_operacional,
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
    zona: str | None = None
    notas: str | None = None
    situacao_operacional: str = "por_avaliar"


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
          AND m.estado = 'em_execucao'
        LIMIT 1
    """), {"recurso_id": recurso_id}).scalar()

    if not ainda_ativo:
        recurso = conn.execute(text("""
            SELECT nome, indicativo_radio, estado, ocorrencia_id, operacao_id
            FROM recursos
            WHERE id = :id
        """), {"id": recurso_id}).mappings().first()

        if not recurso:
            return

        ocorrencia_id = recurso["ocorrencia_id"]
        if ocorrencia_id is None and recurso["estado"] == "em_missao":
            conn.execute(text("UPDATE recursos SET estado='disponivel' WHERE id=:id"), {"id": recurso_id})


@app.post("/missoes")
def criar_missao(missao: Missao):
    estados_validos = {"recebida", "planeada", "em_execucao", "concluida", "cancelada"}
    estado = missao.estado if missao.estado in estados_validos else "planeada"
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        missao_id = conn.execute(text("""
            INSERT INTO missoes (
                titulo, descricao, prioridade, estado, recurso_id, ocorrencia_id,
                operacao_id, responsavel, zona, notas, situacao_operacional, atualizada_em,
                planeada_em, iniciada_em, concluida_em, cancelada_em
            )
            VALUES (
                :titulo, :descricao, :prioridade, :estado, :recurso_id, :ocorrencia_id,
                :operacao_id, :responsavel, :zona, :notas, :situacao_operacional, NOW(),
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
            "zona": (missao.zona or "").strip() or None, "notas": missao.notas,
            "situacao_operacional": missao.situacao_operacional if missao.situacao_operacional in {"por_avaliar", "sob_controlo", "estavel", "complexa", "critica", "necessita_reforco"} else "por_avaliar",
        }).scalar_one()
        if missao.recurso_id is not None:
            conn.execute(text("""
                INSERT INTO missao_recursos (missao_id, recurso_id)
                VALUES (:missao_id, :recurso_id)
                ON CONFLICT (missao_id, recurso_id) DO NOTHING
            """), {"missao_id": missao_id, "recurso_id": missao.recurso_id})
            if estado == "em_execucao":
                conn.execute(text("""
                    UPDATE recursos SET estado='em_missao'
                    WHERE id=:recurso_id AND operacao_id=:operacao_id AND ocorrencia_id IS NULL
                      AND estado IN ('disponivel', 'em_missao')
                """), {"recurso_id": missao.recurso_id, "operacao_id": operacao_id})
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"Miss\u00e3o criada: {missao.titulo.strip()}",
                 "operacao_id": operacao_id, "ocorrencia_id": missao.ocorrencia_id})
    return {"mensagem": "Miss\u00e3o criada com sucesso", "id": missao_id}

@app.put("/missoes/{missao_id}/estado")
def alterar_estado_missao(missao_id: int, dados: EstadoMissao):
    estados_validos = {"recebida", "planeada", "em_execucao", "concluida", "cancelada"}
    if dados.estado not in estados_validos:
        raise HTTPException(status_code=400, detail="Estado de miss\u00e3o inv\u00e1lido")

    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        missao = conn.execute(text("""
            SELECT id, titulo, ocorrencia_id
            FROM missoes
            WHERE id = :id AND operacao_id = :operacao_id
        """), {"id": missao_id, "operacao_id": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="Miss\u00e3o n\u00e3o encontrada")

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
            conn.execute(text("""
                UPDATE recursos SET estado='em_missao'
                WHERE id=ANY(:ids) AND operacao_id=:operacao_id AND ocorrencia_id IS NULL
                  AND estado IN ('disponivel', 'em_missao')
            """), {"ids": recurso_ids, "operacao_id": operacao_id})
        else:
            for recurso_id in recurso_ids:
                _libertar_recurso_se_sem_missao_ativa(conn, recurso_id)

        rotulos = {"recebida": "Recebida", "planeada": "Planeada",
                   "em_execucao": "Em execu\u00e7\u00e3o", "concluida": "Conclu\u00edda",
                   "cancelada": "Cancelada"}
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"Miss\u00e3o {missao['titulo']} alterada para {rotulos[dados.estado]}",
                 "operacao_id": operacao_id, "ocorrencia_id": missao["ocorrencia_id"]})
    return {"mensagem": "Estado da miss\u00e3o atualizado"}

@app.put("/missoes/{missao_id}/situacao")
def alterar_situacao_missao(missao_id: int, dados: SituacaoMissao):
    situacoes_validas = {"por_avaliar", "sob_controlo", "estavel", "complexa", "critica", "necessita_reforco"}
    if dados.situacao_operacional not in situacoes_validas:
        raise HTTPException(status_code=400, detail="Situa\u00e7\u00e3o operacional inv\u00e1lida")
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        missao = conn.execute(text("""
            SELECT id, titulo, ocorrencia_id FROM missoes
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": missao_id, "operacao_id": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="Miss\u00e3o n\u00e3o encontrada")
        conn.execute(text("""
            UPDATE missoes SET situacao_operacional=:situacao, atualizada_em=NOW() WHERE id=:id
        """), {"situacao": dados.situacao_operacional, "id": missao_id})
        rotulos = {
            "por_avaliar": "Por avaliar", "sob_controlo": "Sob controlo", "estavel": "Est\u00e1vel", "complexa": "Complexa",
            "critica": "Cr\u00edtica", "necessita_reforco": "Necessita de refor\u00e7o"
        }
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"Situa\u00e7\u00e3o da miss\u00e3o {missao['titulo']}: {rotulos[dados.situacao_operacional]}",
                 "operacao_id": operacao_id, "ocorrencia_id": missao["ocorrencia_id"]})
    return {"mensagem": "Situa\u00e7\u00e3o operacional atualizada"}

@app.get("/missoes/{missao_id}/notas")
def listar_notas_missao(missao_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        existe = conn.execute(text("SELECT 1 FROM missoes WHERE id=:id AND operacao_id=:operacao_id"),
                              {"id": missao_id, "operacao_id": operacao_id}).scalar()
        if not existe:
            raise HTTPException(status_code=404, detail="Miss\u00e3o n\u00e3o encontrada")
        rows = conn.execute(text("""
            SELECT id, autor, texto, criado_em FROM missao_notas
            WHERE missao_id=:id ORDER BY criado_em DESC, id DESC
        """), {"id": missao_id})
        return [dict(r._mapping) for r in rows]


@app.post("/missoes/{missao_id}/notas")
def adicionar_nota_missao(missao_id: int, nota: NotaMissao):
    texto_nota = nota.texto.strip()
    if not texto_nota:
        raise HTTPException(status_code=400, detail="A nota n\u00e3o pode estar vazia")
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        missao = conn.execute(text("""
            SELECT id, titulo, ocorrencia_id FROM missoes
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": missao_id, "operacao_id": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="Miss\u00e3o n\u00e3o encontrada")
        nota_id = conn.execute(text("""
            INSERT INTO missao_notas (missao_id, autor, texto)
            VALUES (:missao_id, :autor, :texto) RETURNING id
        """), {"missao_id": missao_id, "autor": (nota.autor or "Operador").strip(), "texto": texto_nota}).scalar_one()
        conn.execute(text("UPDATE missoes SET atualizada_em=NOW() WHERE id=:id"), {"id": missao_id})
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"Nova nota na miss\u00e3o {missao['titulo']}: {texto_nota}",
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
            raise HTTPException(status_code=404, detail="MissÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
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
            raise HTTPException(status_code=404, detail="MissÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
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
            raise HTTPException(status_code=404, detail="MissÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
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
            raise HTTPException(status_code=404, detail="MissÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        recurso = conn.execute(text("""
            SELECT id, nome, indicativo_radio FROM recursos
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": recurso_id, "operacao_id": operacao_id}).mappings().first()
        if not recurso:
            raise HTTPException(status_code=404, detail="Recurso nÃƒÆ’Ã‚Â£o encontrado na operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o ativa")
        conn.execute(text("""
            INSERT INTO missao_recursos (missao_id, recurso_id)
            VALUES (:missao_id, :recurso_id)
            ON CONFLICT (missao_id, recurso_id) DO NOTHING
        """), {"missao_id": missao_id, "recurso_id": recurso_id})
        _atualizar_recurso_principal_missao(conn, missao_id)
        if missao["estado"] == "em_execucao":
            conn.execute(text("""
                UPDATE recursos SET estado='em_missao' WHERE id=:id AND operacao_id=:operacao_id
                  AND ocorrencia_id IS NULL AND estado IN ('disponivel', 'em_missao')
            """), {"id": recurso_id, "operacao_id": operacao_id})
        nome_recurso = recurso["indicativo_radio"] or recurso["nome"] or f"Recurso {recurso_id}"
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"{nome_recurso} adicionado ÃƒÆ’Ã‚Â  missÃƒÆ’Ã‚Â£o {missao['titulo']}",
                 "operacao_id": operacao_id, "ocorrencia_id": missao["ocorrencia_id"]})
    return {"mensagem": "Recurso adicionado ÃƒÆ’Ã‚Â  missÃƒÆ’Ã‚Â£o"}


@app.delete("/missoes/{missao_id}/recursos/{recurso_id}")
def remover_recurso_missao(missao_id: int, recurso_id: int):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        missao = conn.execute(text("""
            SELECT id, titulo, ocorrencia_id FROM missoes
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": missao_id, "operacao_id": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="MissÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        recurso = conn.execute(text("SELECT nome, indicativo_radio FROM recursos WHERE id=:id"), {"id": recurso_id}).mappings().first()
        resultado = conn.execute(text("""
            DELETE FROM missao_recursos
            WHERE missao_id=:missao_id AND recurso_id=:recurso_id
        """), {"missao_id": missao_id, "recurso_id": recurso_id})
        if resultado.rowcount == 0:
            raise HTTPException(status_code=404, detail="O recurso nÃƒÆ’Ã‚Â£o estÃƒÆ’Ã‚Â¡ associado ÃƒÆ’Ã‚Â  missÃƒÆ’Ã‚Â£o")
        _atualizar_recurso_principal_missao(conn, missao_id)
        _libertar_recurso_se_sem_missao_ativa(conn, recurso_id)
        nome_recurso = ((recurso or {}).get("indicativo_radio") or (recurso or {}).get("nome") or f"Recurso {recurso_id}")
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, operacao_id, ocorrencia_id)
            VALUES ('missao', :descricao, :operacao_id, :ocorrencia_id)
        """), {"descricao": f"{nome_recurso} removido da missÃƒÆ’Ã‚Â£o {missao['titulo']}",
                 "operacao_id": operacao_id, "ocorrencia_id": missao["ocorrencia_id"]})
    return {"mensagem": "Recurso removido da missÃƒÆ’Ã‚Â£o"}


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
            return {"erro": "Elemento nÃƒÆ’Ã‚Â£o encontrado"}

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
        operacao_id = exigir_operacao_editavel_id(conn)
        elemento = conn.execute(text("""
            SELECT nome, indicativo_radio, ocorrencia_id, recurso_id
            FROM elementos
            WHERE id=:elemento_id AND operacao_id=:operacao_id
            FOR UPDATE
        """), {"elemento_id": elemento_id, "operacao_id": operacao_id}).mappings().first()
        if not elemento:
            raise HTTPException(status_code=404, detail="Elemento não encontrado nesta operação")
        recurso = conn.execute(text("""
            SELECT nome, indicativo_radio, ocorrencia_id FROM recursos
            WHERE id=:recurso_id AND operacao_id=:operacao_id
        """), {"recurso_id": recurso_id, "operacao_id": operacao_id}).mappings().first()
        if not recurso:
            raise HTTPException(status_code=404, detail="Viatura não encontrada nesta operação")
        if elemento["recurso_id"] == recurso_id:
            return {"ok": True}
        if elemento["recurso_id"] is not None:
            raise HTTPException(status_code=409, detail="O elemento já está embarcado noutra viatura")
        if elemento["ocorrencia_id"] is not None and elemento["ocorrencia_id"] != recurso["ocorrencia_id"]:
            raise HTTPException(status_code=409, detail="Liberte primeiro o elemento da outra ocorrência")
        conn.execute(text("""
            UPDATE elementos SET recurso_id=:recurso_id, ocorrencia_id=:ocorrencia_id,
                estado='embarcado', localizacao=NULL
            WHERE id=:elemento_id AND operacao_id=:operacao_id
        """), {"elemento_id": elemento_id, "recurso_id": recurso_id,
               "ocorrencia_id": recurso["ocorrencia_id"], "operacao_id": operacao_id})
        if recurso["ocorrencia_id"] is not None:
            conn.execute(text("""
                INSERT INTO elemento_empenhos (operacao_id, elemento_id, recurso_id, ocorrencia_id)
                VALUES (:operacao_id, :elemento_id, :recurso_id, :ocorrencia_id)
                ON CONFLICT (operacao_id, elemento_id) WHERE fim_em IS NULL DO UPDATE
                    SET recurso_id=EXCLUDED.recurso_id
            """), {"operacao_id": operacao_id, "elemento_id": elemento_id,
                   "recurso_id": recurso_id, "ocorrencia_id": recurso["ocorrencia_id"]})
        nome_elemento = elemento["nome"] + (f" ({elemento['indicativo_radio']})" if elemento["indicativo_radio"] else "")
        nome_recurso = recurso["nome"] + (f" ({recurso['indicativo_radio']})" if recurso["indicativo_radio"] else "")
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, elemento_id, recurso_id, ocorrencia_id, operacao_id)
            VALUES ('elemento', :descricao, :elemento_id, :recurso_id, :ocorrencia_id, :operacao_id)
        """), {"descricao": f"Elemento reembarcado: {nome_elemento} em {nome_recurso}",
               "elemento_id": elemento_id, "recurso_id": recurso_id,
               "ocorrencia_id": recurso["ocorrencia_id"], "operacao_id": operacao_id})

    return {"ok": True}

@app.get("/recursos-operacionais/resumo")
def resumo_recursos_operacionais():
    """Resumo dos recursos da operaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o ativa para o quadro operacional."""
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)

        recursos = conn.execute(text("""
            SELECT
                r.id AS recurso_id,
                r.nome,
                r.tipo,
                r.indicativo_radio,
                r.estado,
                r.ocorrencia_id,
                o.titulo AS ocorrencia_atual
            FROM recursos r
            LEFT JOIN ocorrencias o
              ON o.id = r.ocorrencia_id
             AND o.operacao_id = r.operacao_id
            WHERE r.operacao_id = :operacao_id
            ORDER BY COALESCE(r.indicativo_radio, r.nome), r.id
        """), {"operacao_id": operacao_id}).mappings().all()

        resumo = []
        for recurso in recursos:
            recurso_id = recurso["recurso_id"]

            total_missoes = int(conn.execute(text("""
                SELECT COUNT(DISTINCT mr.missao_id)
                FROM missao_recursos mr
                JOIN missoes m ON m.id = mr.missao_id
                WHERE mr.recurso_id = :recurso_id
                  AND m.operacao_id = :operacao_id
            """), {
                "recurso_id": recurso_id,
                "operacao_id": operacao_id
            }).scalar() or 0)

            periodos = conn.execute(text("""
                WITH libertacoes AS (
                    SELECT id, ocorrencia_id, criado_em AS libertado_em
                    FROM timeline_eventos
                    WHERE recurso_id = :recurso_id
                      AND operacao_id = :operacao_id
                      AND tipo = 'recurso'
                      AND descricao LIKE 'Recurso libertado:%'
                      AND ocorrencia_id IS NOT NULL
                )
                SELECT
                    (
                        SELECT MAX(t.criado_em)
                        FROM ordens t
                        WHERE t.recurso_id = :recurso_id
                          AND t.operacao_id = :operacao_id
                          AND t.ocorrencia_id = l.ocorrencia_id
                          AND t.titulo LIKE 'Desloca%'
                          AND t.criado_em <= l.libertado_em
                          AND NOT EXISTS (
                              SELECT 1
                              FROM timeline_eventos lib_anterior
                              WHERE lib_anterior.recurso_id = :recurso_id
                                AND lib_anterior.operacao_id = :operacao_id
                                AND lib_anterior.ocorrencia_id = l.ocorrencia_id
                                AND lib_anterior.tipo = 'recurso'
                                AND lib_anterior.descricao LIKE 'Recurso libertado:%'
                                AND lib_anterior.criado_em < l.libertado_em
                                AND t.criado_em <= lib_anterior.criado_em
                          )
                    ) AS mobilizado_em,
                    l.libertado_em
                FROM libertacoes l
            """), {
                "recurso_id": recurso_id,
                "operacao_id": operacao_id
            }).mappings().all()

            tempo_total = 0
            for periodo in periodos:
                if periodo["mobilizado_em"] is None or periodo["libertado_em"] is None:
                    continue
                tempo_total += max(
                    0,
                    int((periodo["libertado_em"] - periodo["mobilizado_em"]).total_seconds())
                )

            # Se o recurso continua empenhado, soma tambÃƒÆ’Ã‚Â©m o perÃƒÆ’Ã‚Â­odo ainda em curso.
            empenho_atual_segundos = 0
            mobilizado_em_atual = None
            if recurso["estado"] != "disponivel" and recurso["ocorrencia_id"] is not None:
                mobilizado_em_atual = conn.execute(text("""
                    SELECT MAX(t.criado_em)
                    FROM ordens t
                    WHERE t.recurso_id = :recurso_id
                      AND t.operacao_id = :operacao_id
                      AND t.ocorrencia_id = :ocorrencia_id
                      AND t.titulo LIKE 'Desloca%'
                      AND NOT EXISTS (
                          SELECT 1
                          FROM timeline_eventos l
                          WHERE l.recurso_id = t.recurso_id
                            AND l.operacao_id = t.operacao_id
                            AND l.ocorrencia_id = t.ocorrencia_id
                            AND l.tipo = 'recurso'
                            AND l.descricao LIKE 'Recurso libertado:%'
                            AND l.criado_em >= t.criado_em
                      )
                """), {
                    "recurso_id": recurso_id,
                    "operacao_id": operacao_id,
                    "ocorrencia_id": recurso["ocorrencia_id"]
                }).scalar()

                if mobilizado_em_atual is not None:
                    agora = datetime.now()
                    empenho_atual_segundos = max(
                        0, int((agora - mobilizado_em_atual).total_seconds())
                    )
                    tempo_total += empenho_atual_segundos

            total_ocorrencias = conn.execute(text("""
                SELECT COUNT(DISTINCT ocorrencia_id) FROM ordens
                WHERE operacao_id=:operacao_id AND recurso_id=:recurso_id
                  AND titulo LIKE 'Desloca%'
            """), {"operacao_id": operacao_id, "recurso_id": recurso_id}).scalar() or 0
            resumo.append({
                **dict(recurso),
                "total_ocorrencias": total_ocorrencias,
                "total_missoes": total_missoes,
                "tempo_total_empenhado_segundos": tempo_total,
                "empenho_atual_segundos": empenho_atual_segundos,
                "mobilizado_em_atual": mobilizado_em_atual
            })

        return resumo


@app.get("/elementos-operacionais/resumo")
def resumo_elementos_operacionais():
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        linhas = conn.execute(text("""
            SELECT e.id AS elemento_id, e.nome, ec.posto, e.funcao,
                   e.indicativo_radio, e.estado, e.recurso_id, e.ocorrencia_id,
                   r.nome AS recurso_nome, r.indicativo_radio AS recurso_indicativo,
                   COUNT(DISTINCT ee.ocorrencia_id)::INTEGER AS total_ocorrencias,
                   COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM
                       (COALESCE(ee.fim_em, NOW()) - ee.inicio_em)))), 0)::INTEGER
                       AS tempo_total_empenhado_segundos
            FROM elementos e
            LEFT JOIN elementos_catalogo ec ON ec.id=e.elemento_catalogo_id
            LEFT JOIN recursos r ON r.id=e.recurso_id AND r.operacao_id=e.operacao_id
            LEFT JOIN elemento_empenhos ee ON ee.elemento_id=e.id AND ee.operacao_id=e.operacao_id
            WHERE e.operacao_id=:operacao_id
            GROUP BY e.id, ec.posto, r.nome, r.indicativo_radio
            ORDER BY e.nome, e.id
        """), {"operacao_id": operacao_id}).mappings()
        return [dict(linha) for linha in linhas]


@app.get("/elementos/{elemento_id}/historico")
def historico_elemento(elemento_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        existe = conn.execute(text("""
            SELECT 1 FROM elementos WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": elemento_id, "operacao_id": operacao_id}).scalar()
        if not existe:
            raise HTTPException(status_code=404, detail="Elemento não encontrado")
        linhas = conn.execute(text("""
            SELECT ee.ocorrencia_id, o.titulo AS ocorrencia_titulo,
                   MIN(ee.inicio_em) AS primeira_mobilizacao,
                   MAX(ee.fim_em) AS ultima_libertacao,
                   BOOL_OR(ee.fim_em IS NULL) AS em_curso,
                   COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM
                       (COALESCE(ee.fim_em, NOW()) - ee.inicio_em)))), 0)::INTEGER
                       AS tempo_empenhado_segundos
            FROM elemento_empenhos ee
            JOIN ocorrencias o ON o.id=ee.ocorrencia_id AND o.operacao_id=ee.operacao_id
            WHERE ee.operacao_id=:operacao_id AND ee.elemento_id=:elemento_id
            GROUP BY ee.ocorrencia_id, o.titulo
            ORDER BY MIN(ee.inicio_em) DESC
        """), {"operacao_id": operacao_id, "elemento_id": elemento_id}).mappings()
        return [dict(linha) for linha in linhas]


@app.put("/elementos/{elemento_id}/libertar")
def libertar_elemento(elemento_id: int):
    with engine.begin() as conn:
        operacao_id = exigir_operacao_editavel_id(conn)
        elemento = conn.execute(text("""
            SELECT nome, ocorrencia_id FROM elementos
            WHERE id=:id AND operacao_id=:operacao_id
        """), {"id": elemento_id, "operacao_id": operacao_id}).mappings().first()
        if not elemento:
            raise HTTPException(status_code=404, detail="Elemento não encontrado nesta operação")
        if elemento["ocorrencia_id"] is None:
            raise HTTPException(status_code=409, detail="O elemento não está afetado a uma ocorrência")
        conn.execute(text("""
            UPDATE elemento_empenhos SET fim_em=NOW()
            WHERE operacao_id=:operacao_id AND elemento_id=:elemento_id AND fim_em IS NULL
        """), {"operacao_id": operacao_id, "elemento_id": elemento_id})
        conn.execute(text("""
            UPDATE elementos SET ocorrencia_id=NULL, recurso_id=NULL, estado='disponivel'
            WHERE id=:elemento_id AND operacao_id=:operacao_id
        """), {"elemento_id": elemento_id, "operacao_id": operacao_id})
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo, descricao, ocorrencia_id, operacao_id)
            VALUES ('elemento', :descricao, :ocorrencia_id, :operacao_id)
        """), {"descricao": f"Elemento libertado: {elemento['nome']}",
               "ocorrencia_id": elemento["ocorrencia_id"], "operacao_id": operacao_id})
    return {"mensagem": "Elemento libertado"}


@app.get("/recursos/{recurso_id}/historico")
def historico_recurso(recurso_id: int):
    with engine.connect() as conn:
        operacao_id = exigir_operacao_ativa_id(conn)
        total_ocorrencias = conn.execute(
            text("""
                SELECT COUNT(DISTINCT ocorrencia_id)
                FROM ordens
                WHERE recurso_id = :recurso_id
                AND operacao_id = :operacao_id
                AND ocorrencia_id IS NOT NULL
                AND titulo LIKE 'Desloca%'
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

        # Tempo empenhado: da primeira ordem de deslocaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o atÃƒÆ’Ã‚Â© ÃƒÆ’Ã‚Â  libertaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o
        # do recurso na mesma ocorrÃƒÆ’Ã‚Âªncia.
        periodos_empenho = conn.execute(
            text("""
                WITH libertacoes AS (
                    SELECT id, ocorrencia_id, criado_em AS libertado_em
                    FROM timeline_eventos
                    WHERE recurso_id = :recurso_id
                      AND operacao_id = :operacao_id
                      AND tipo = 'recurso'
                      AND descricao LIKE 'Recurso libertado:%'
                      AND ocorrencia_id IS NOT NULL
                )
                SELECT
                    l.ocorrencia_id,
                    o.titulo AS ocorrencia_titulo,
                    (
                        SELECT MAX(t.criado_em)
                        FROM ordens t
                        WHERE t.recurso_id = :recurso_id
                          AND t.operacao_id = :operacao_id
                          AND t.ocorrencia_id = l.ocorrencia_id
                          AND t.titulo LIKE 'Desloca%'
                          AND t.criado_em <= l.libertado_em
                          AND NOT EXISTS (
                              SELECT 1
                              FROM timeline_eventos lib_anterior
                              WHERE lib_anterior.recurso_id = :recurso_id
                                AND lib_anterior.operacao_id = :operacao_id
                                AND lib_anterior.ocorrencia_id = l.ocorrencia_id
                                AND lib_anterior.tipo = 'recurso'
                                AND lib_anterior.descricao LIKE 'Recurso libertado:%'
                                AND lib_anterior.criado_em < l.libertado_em
                                AND t.criado_em <= lib_anterior.criado_em
                          )
                    ) AS mobilizado_em,
                    l.libertado_em
                FROM libertacoes l
                LEFT JOIN ocorrencias o ON o.id = l.ocorrencia_id
                ORDER BY l.libertado_em
            """),
            {"recurso_id": recurso_id, "operacao_id": operacao_id}
        ).mappings().all()

        ocorrencias_empenho = []
        tempo_total_empenhado_segundos = 0
        for periodo in periodos_empenho:
            mobilizado_em = periodo["mobilizado_em"]
            libertado_em = periodo["libertado_em"]
            if mobilizado_em is None or libertado_em is None:
                continue
            segundos = max(0, int((libertado_em - mobilizado_em).total_seconds()))
            tempo_total_empenhado_segundos += segundos
            ocorrencias_empenho.append({
                "ocorrencia_id": periodo["ocorrencia_id"],
                "ocorrencia_titulo": periodo["ocorrencia_titulo"],
                "mobilizado_em": mobilizado_em,
                "libertado_em": libertado_em,
                "tempo_empenhado_segundos": segundos
            })

        atual = conn.execute(text("""
            SELECT r.ocorrencia_id, o.titulo AS ocorrencia_titulo,
                   (SELECT MAX(ord.criado_em) FROM ordens ord
                    WHERE ord.recurso_id=r.id AND ord.operacao_id=r.operacao_id
                      AND ord.ocorrencia_id=r.ocorrencia_id AND ord.titulo LIKE 'Desloca%')
                      AS mobilizado_em
            FROM recursos r JOIN ocorrencias o ON o.id=r.ocorrencia_id
            WHERE r.id=:recurso_id AND r.operacao_id=:operacao_id
        """), {"recurso_id": recurso_id, "operacao_id": operacao_id}).mappings().first()
        if atual and atual["mobilizado_em"]:
            segundos = max(0, int((datetime.now() - atual["mobilizado_em"]).total_seconds()))
            tempo_total_empenhado_segundos += segundos
            ocorrencias_empenho.append({
                "ocorrencia_id": atual["ocorrencia_id"],
                "ocorrencia_titulo": atual["ocorrencia_titulo"],
                "mobilizado_em": atual["mobilizado_em"], "libertado_em": None,
                "tempo_empenhado_segundos": segundos
            })

        return {
            "recurso_id": recurso_id,
            "total_ocorrencias": total_ocorrencias,
            "total_missoes": total_missoes,
            "ordens_executadas": ordens_executadas,
            "chegadas_registadas": chegadas_ids,
            "tempo_total_empenhado_segundos": tempo_total_empenhado_segundos,
            "ocorrencias_empenho": ocorrencias_empenho,
            "eventos": [dict(linha._mapping) for linha in eventos]
        }


# ==================== SETORES OPERACIONAIS ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SPRINT 10.1 ====================
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
        raise HTTPException(status_code=400, detail="Estado de setor invÃƒÆ’Ã‚Â¡lido")
    if not dados.nome.strip():
        raise HTTPException(status_code=400, detail="O nome do setor ÃƒÆ’Ã‚Â© obrigatÃƒÆ’Ã‚Â³rio")
    if not dados.cor or not dados.cor.startswith("#") or len(dados.cor) not in (4, 7):
        raise HTTPException(status_code=400, detail="Cor do setor invÃƒÆ’Ã‚Â¡lida")

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
            raise HTTPException(status_code=404, detail="Setor nÃƒÆ’Ã‚Â£o encontrado")
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
            return {"mensagem": "Setor arquivado porque possui objetivos ou missÃƒÆ’Ã‚Âµes associados", "arquivado": True}
        apagado = conn.execute(text("""
            DELETE FROM setores WHERE id=:id AND operacao_id=:op RETURNING id
        """), {"id": setor_id, "op": operacao_id}).scalar()
        if not apagado:
            raise HTTPException(status_code=404, detail="Setor nÃƒÆ’Ã‚Â£o encontrado")
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
                raise HTTPException(status_code=404, detail="Setor nÃƒÆ’Ã‚Â£o encontrado")
        objetivo = conn.execute(text("""
            UPDATE objetivos SET setor_id=:setor_id,atualizado_em=NOW()
            WHERE id=:id AND operacao_id=:op
            RETURNING nome,ocorrencia_id
        """), {"setor_id": dados.setor_id, "id": objetivo_id, "op": operacao_id}).mappings().first()
        if not objetivo:
            raise HTTPException(status_code=404, detail="Objetivo nÃƒÆ’Ã‚Â£o encontrado")
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
                raise HTTPException(status_code=404, detail="Setor nÃƒÆ’Ã‚Â£o encontrado")
        missao = conn.execute(text("""
            UPDATE missoes SET setor_id=:setor_id,atualizada_em=NOW()
            WHERE id=:id AND operacao_id=:op
            RETURNING titulo,ocorrencia_id
        """), {"setor_id": dados.setor_id, "id": missao_id, "op": operacao_id}).mappings().first()
        if not missao:
            raise HTTPException(status_code=404, detail="MissÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        conn.execute(text("""
            INSERT INTO timeline_eventos (tipo,descricao,operacao_id,ocorrencia_id)
            VALUES ('setor',:descricao,:op,:oc)
        """), {"descricao": f"Setor da missÃƒÆ’Ã‚Â£o {missao['titulo']} atualizado", "op": operacao_id, "oc": missao["ocorrencia_id"]})
    return {"mensagem": "Setor da missÃƒÆ’Ã‚Â£o atualizado"}

# ==================== OBJETIVOS OPERACIONAIS ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SPRINT 9.1 ====================
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
        raise HTTPException(status_code=400, detail="Prioridade de objetivo invÃƒÆ’Ã‚Â¡lida")
    if dados.estado not in estados:
        raise HTTPException(status_code=400, detail="Estado de objetivo invÃƒÆ’Ã‚Â¡lido")
    if not dados.nome.strip():
        raise HTTPException(status_code=400, detail="O nome do objetivo ÃƒÆ’Ã‚Â© obrigatÃƒÆ’Ã‚Â³rio")

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
        if not existe: raise HTTPException(status_code=404, detail="Objetivo nÃƒÆ’Ã‚Â£o encontrado")
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
            return {"mensagem":"Objetivo arquivado porque possui missÃƒÆ’Ã‚Âµes associadas","arquivado":True}
        apagado=conn.execute(text("DELETE FROM objetivos WHERE id=:id AND operacao_id=:op RETURNING id"),{"id":objetivo_id,"op":operacao_id}).scalar()
        if not apagado: raise HTTPException(status_code=404, detail="Objetivo nÃƒÆ’Ã‚Â£o encontrado")
    return {"mensagem":"Objetivo eliminado","arquivado":False}

@app.put("/missoes/{missao_id}/objetivo")
def associar_objetivo_missao(missao_id:int, dados:AssociacaoObjetivoMissao):
    with engine.begin() as conn:
        operacao_id=exigir_operacao_editavel_id(conn)
        if dados.objetivo_id is not None:
            ok=conn.execute(text("SELECT 1 FROM objetivos WHERE id=:id AND operacao_id=:op AND arquivado=FALSE"),{"id":dados.objetivo_id,"op":operacao_id}).scalar()
            if not ok: raise HTTPException(status_code=404, detail="Objetivo nÃƒÆ’Ã‚Â£o encontrado")
        atualizado=conn.execute(text("UPDATE missoes SET objetivo_id=:oid,atualizada_em=NOW() WHERE id=:id AND operacao_id=:op RETURNING titulo,ocorrencia_id"),{"oid":dados.objetivo_id,"id":missao_id,"op":operacao_id}).mappings().first()
        if not atualizado: raise HTTPException(status_code=404, detail="MissÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada")
        conn.execute(text("INSERT INTO timeline_eventos (tipo,descricao,operacao_id,ocorrencia_id) VALUES ('objetivo',:d,:op,:oc)"),{"d":f"Objetivo da missÃƒÆ’Ã‚Â£o {atualizado['titulo']} atualizado","op":operacao_id,"oc":atualizado['ocorrencia_id']})
    return {"mensagem":"Objetivo da missÃƒÆ’Ã‚Â£o atualizado"}

@app.get("/objetivo-modelos")
def listar_modelos_objetivo(incluir_inativos:bool=False):
    with engine.connect() as conn:
        rows=conn.execute(text("SELECT * FROM objetivo_modelos WHERE (:todos OR ativo=TRUE) ORDER BY nome"),{"todos":incluir_inativos})
        return [dict(r._mapping) for r in rows]

@app.post("/objetivo-modelos")
def criar_modelo_objetivo(dados:ModeloObjetivo):
    if not dados.nome.strip(): raise HTTPException(status_code=400,detail="O nome ÃƒÆ’Ã‚Â© obrigatÃƒÆ’Ã‚Â³rio")
    with engine.begin() as conn:
        exigir_operacao_editavel_id(conn)
        mid=conn.execute(text("INSERT INTO objetivo_modelos (nome,descricao,prioridade,ativo) VALUES (:nome,:descricao,:prioridade,:ativo) RETURNING id"),{**dados.model_dump(),"nome":dados.nome.strip()}).scalar_one()
    return {"id":mid,"mensagem":"Modelo criado"}

@app.put("/objetivo-modelos/{modelo_id}")
def atualizar_modelo_objetivo(modelo_id:int,dados:ModeloObjetivo):
    with engine.begin() as conn:
        exigir_operacao_editavel_id(conn)
        ok=conn.execute(text("UPDATE objetivo_modelos SET nome=:nome,descricao=:descricao,prioridade=:prioridade,ativo=:ativo,atualizado_em=NOW() WHERE id=:id RETURNING id"),{**dados.model_dump(),"id":modelo_id,"nome":dados.nome.strip()}).scalar()
        if not ok: raise HTTPException(status_code=404,detail="Modelo nÃƒÆ’Ã‚Â£o encontrado")
    return {"mensagem":"Modelo atualizado"}

@app.delete("/objetivo-modelos/{modelo_id}")
def eliminar_modelo_objetivo(modelo_id:int):
    with engine.begin() as conn:
        exigir_operacao_editavel_id(conn)
        ok=conn.execute(text("DELETE FROM objetivo_modelos WHERE id=:id RETURNING id"),{"id":modelo_id}).scalar()
        if not ok: raise HTTPException(status_code=404,detail="Modelo nÃƒÆ’Ã‚Â£o encontrado")
    return {"mensagem":"Modelo eliminado"}
