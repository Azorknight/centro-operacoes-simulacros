import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)


def testar_ligacao():
    with engine.connect() as conn:
        resultado = conn.execute(text("SELECT 'Ligação com sucesso!'"))
        for linha in resultado:
            return linha[0]