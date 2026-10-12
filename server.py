from dotenv import load_dotenv
load_dotenv()
from main import app
from sgo_auth import install
install(app)
