@echo off
title NIA Antigravity
cd /d "%~dp0"

echo.
echo  ============================================================
echo   NIA Antigravity — Subscription Intelligence Platform
echo  ============================================================
echo.

REM ── Backend: start silently in background, logs go to backend.log ─────────────
echo  [1/2] Starting backend on port 8000...
pushd backend
start /b cmd /c "call venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > ..\backend.log 2>&1"
popd

timeout /t 3 /nobreak >nul

REM ── Frontend ──────────────────────────────────────────────────────────────────
echo  [2/2] Starting frontend on port 5173...
echo.
echo  -----------------------------------------------
echo   Open   ^>  http://localhost:5173
echo   Logs   ^>  backend.log  (backend output here)
echo  -----------------------------------------------
echo.

IF NOT EXIST node_modules (
    echo  Installing dependencies...
    npm install
    echo.
)

npm run dev
