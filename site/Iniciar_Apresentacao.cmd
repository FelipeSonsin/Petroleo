@echo off
rem Abre a jornada 3D do petroleo localmente (sem internet). Requer Node.js.
cd /d "%~dp0"
if not exist node_modules call npm install || goto erro
call npm run build || goto erro
call npx vite preview --port 4173 --strictPort --open
goto :eof
:erro
echo.
echo Falha ao preparar a apresentacao. Veja a mensagem acima.
pause
