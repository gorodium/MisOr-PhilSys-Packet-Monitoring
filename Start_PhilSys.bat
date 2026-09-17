@echo off
title PhilSys Packet Monitoring Server
echo ===================================================
echo Starting PhilSys Packet Monitoring Server...
echo Please DO NOT close this black window while using the app!
echo ===================================================
echo.

:: Start the Next.js server in the background
start /B npm run dev

:: Wait 8 seconds for the server to spin up
echo Waiting for server to initialize...
timeout /t 8 /nobreak >nul

:: Open Edge or Chrome in App Mode (borderless)
echo Launching App Window...
start msedge --app=http://localhost:3000 || start chrome --app=http://localhost:3000

echo.
echo Application launched successfully. 
echo To completely stop the system, close this command window.
