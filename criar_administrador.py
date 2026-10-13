"""Criar a primeira conta de administrador no servidor SGO."""
import argparse
import getpass
from pathlib import Path
from dotenv import load_dotenv
import sgo_auth


def main():
    load_dotenv(Path(__file__).resolve().parent / '.env')
    parser = argparse.ArgumentParser(description='Criar conta de administrador do SGO')
    parser.add_argument('--nome', required=True)
    args = parser.parse_args()
    name = args.nome.strip().lower()
    if not name or len(name) > 100:
        parser.error('Nome obrigatório, até 100 caracteres')
    with sgo_auth.connect() as conn:
        if conn.execute('SELECT 1 FROM users WHERE name=?', (name,)).fetchone():
            parser.error('Já existe uma conta com este nome; não foi alterada')
    password = getpass.getpass('Palavra-passe (mínimo 8 caracteres): ')
    repeat = getpass.getpass('Repetir: ')
    if password != repeat:
        parser.error('As palavras-passe não coincidem')
    if not 8 <= len(password) <= 256:
        parser.error('Palavra-passe entre 8 e 256 caracteres')
    salt = sgo_auth.secrets.token_hex(16)
    hashed = sgo_auth.digest(password, salt)
    with sgo_auth.connect() as conn:
        try:
            conn.execute('INSERT INTO users VALUES (?,?,?,?,1)', (name,salt,hashed,'administrador'))
        except sgo_auth.sqlite3.IntegrityError:
            parser.error('Já existe uma conta com este nome; não foi alterada')
    print('Conta de administrador criada.')


if __name__ == '__main__':
    main()
