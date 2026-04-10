@echo off

echo === A iniciar Centro de Operacoes e Simulacros ===

echo.
echo [1/2] Backend...
start cmd /k "cd /d C:\centro-operacoes-simulacros && py -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt && uvicorn main:app --reload"

timeout /t 3

echo.
echo [2/2] Frontend...
start cmd /k "cd /d C:\centro-operacoes-simulacros\frontend && npm install && npm run dev"

echo.
echo Sistema iniciado!
pause