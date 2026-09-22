@echo off
title EPSON L120 Waste Ink Resetter - Installer
color 0A

echo ============================================================
echo   EPSON L120 Waste Ink Pad Resetter - Setup
echo ============================================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo         Please install Python 3.8+ from https://python.org
    pause
    exit /b 1
)

echo [OK]   Python found.

:: Install pyusb
echo.
echo [....] Installing required package: pyusb
python -m pip install --upgrade pyusb
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install pyusb.
    pause
    exit /b 1
)
echo [OK]   pyusb installed.

echo.
echo ============================================================
echo   IMPORTANT: Install libusb driver (Windows only)
echo ============================================================
echo.
echo   To allow Python to talk to USB devices on Windows, you
echo   must replace the EPSON L120 driver with WinUSB via Zadig:
echo.
echo   1. Download Zadig from https://zadig.akeo.ie/
echo   2. Run Zadig as Administrator.
echo   3. Select "Options" > "List All Devices".
echo   4. From the drop-down, choose "EPSON L120".
echo   5. Set the driver to "WinUSB" and click "Replace Driver".
echo.
echo   After Zadig is done, run:  run_resetter.bat
echo.
echo ============================================================
echo.
pause
