CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS recursos (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    tipo TEXT,
    estado TEXT,
    ilha TEXT,
    localizacao GEOMETRY(Point, 4326),
    criado_em TIMESTAMP DEFAULT NOW()
);

ALTER TABLE recursos
ADD COLUMN IF NOT EXISTS ocorrencia_id INTEGER;

CREATE TABLE IF NOT EXISTS ocorrencias (
    id SERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    descricao TEXT,
    tipo TEXT,
    estado TEXT DEFAULT 'aberta',
    ilha TEXT,
    localizacao GEOMETRY(Point, 4326),
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timeline_eventos (
    id SERIAL PRIMARY KEY,
    tipo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    recurso_id INTEGER,
    ocorrencia_id INTEGER,
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bases (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    tipo TEXT,
    ilha TEXT,
    localizacao GEOMETRY(Point, 4326),
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ordens (
    id SERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    descricao TEXT,
    estado TEXT DEFAULT 'emitida',
    recurso_id INTEGER,
    ocorrencia_id INTEGER,
    criado_em TIMESTAMP DEFAULT NOW()
);