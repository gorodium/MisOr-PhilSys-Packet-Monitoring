@echo off
title EPSON L120 Resetter
:: Run as Administrator for USB access
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
cd /d "%~dp0"
python epson_l120_resetter.py
pause
