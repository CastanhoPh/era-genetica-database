@echo off
title Iniciar Jogo - Era Genetica
cd /d "%~dp0"

echo ============================================================
echo   INICIANDO ERA GENETICA
echo ------------------------------------------------------------
echo   1) Abrindo o servidor do app (Vite)...
echo   2) Abrindo o tunel (Cloudflare)...
echo.
echo   O LINK para mandar aos amigos vai aparecer na janela
echo   "TUNEL" - procure a linha:  https://....trycloudflare.com
echo.
echo   Deixe as DUAS janelas abertas durante o jogo.
echo   Para encerrar, feche as duas janelas (ou Ctrl+C nelas).
echo ============================================================
echo.

rem Sobe o servidor do app em uma janela propria
start "SERVIDOR (Vite) - nao feche" cmd /k npm run dev

rem Espera alguns segundos para o servidor ficar pronto antes do tunel
timeout /t 4 /nobreak >nul

rem Sobe o tunel em outra janela (o LINK aparece aqui)
start "TUNEL (Cloudflare) - PEGUE O LINK AQUI" cmd /k npx cloudflared tunnel --url http://localhost:3000

echo Tudo iniciado! Pode fechar esta janela.
timeout /t 6 /nobreak >nul
