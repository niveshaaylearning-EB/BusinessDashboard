@echo off
title NIA Antigravity — Backend API (Port 8001)
cd /d "%~dp0"

echo.
echo  NIA Antigravity Backend
echo  =======================
echo  Port : 8001
echo  Docs : http://localhost:8001/docs
echo.

if not exist ".env" (
    echo  ERROR: .env file not found.
    echo  Copy .env.example to .env and fill in your values first.
    pause
    exit /b 1
)

if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo  Setting up virtual environment...
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install -r requirements.txt
)

echo  Starting server... ^(Keep this window open^)
echo.
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

echo.
echo  Server stopped.
pause
