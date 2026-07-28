@echo off
echo.
echo  ============================================================
echo   NIA Antigravity - Subscription Intelligence Platform
echo  ============================================================
echo.
cd /d "%~dp0"

IF NOT EXIST node_modules (
    echo  Installing dependencies...
    npm install
    echo.
)

echo  Finding your local IP address...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "169.254"') do (
    set LOCAL_IP=%%a
    goto :found
)
:found
set LOCAL_IP=%LOCAL_IP: =%

echo.
echo  ============================================================
echo   Access the dashboard at:
echo.
echo     This machine : http://localhost:5173
echo     Same WiFi    : http://%LOCAL_IP%:5173
echo  ============================================================
echo.
echo  Share the WiFi address with anyone on the same network.
echo.
npm run dev
pause
