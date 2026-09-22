@echo off
setlocal EnableDelayedExpansion
title EPSON L120 Resetter — Full Build
color 0A

echo.
echo ============================================================
echo   EPSON L120 Waste Ink Resetter — Full Build Script
echo ============================================================
echo.

:: ── Locate Python ─────────────────────────────────────────────────────────
set PY=
for %%P in (
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
    "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python313\python.exe"
    "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python312\python.exe"
    "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\python.exe"
) do (
    if exist %%~P (
        set PY=%%~P
        goto :found_python
    )
)
echo [ERROR] Python not found. Install Python 3.10+ from https://python.org
pause & exit /b 1

:found_python
echo [OK]   Python: %PY%

:: ── Install required Python packages ──────────────────────────────────────
echo.
echo [....] Installing Python dependencies...
"%PY%" -m pip install --upgrade --quiet pyusb pyinstaller pillow
if %errorlevel% neq 0 (
    echo [ERROR] pip install failed.
    pause & exit /b 1
)
echo [OK]   Dependencies installed: pyusb, pyinstaller, pillow

:: ── Download assets (libusb DLL, Zadig, icon) ─────────────────────────────
echo.
echo [....] Downloading build assets (libusb, Zadig, icon)...
"%PY%" build_assets.py
if %errorlevel% neq 0 (
    echo [WARN] Some assets may not have downloaded. Continuing...
)

:: ── Verify critical asset: libusb DLL ─────────────────────────────────────
if not exist "assets\libusb\libusb-1.0.dll" (
    echo.
    echo [WARN] libusb-1.0.dll not found at assets\libusb\libusb-1.0.dll
    echo        The EXE will still work, but users must install libusb separately.
    echo        Manually download from: https://github.com/libusb/libusb/releases
    echo.
    choice /C YN /M "Continue build without bundled libusb DLL?"
    if !errorlevel!==2 exit /b 1
)

:: ── PyInstaller — Build standalone EXE ───────────────────────────────────
echo.
echo [....] Building standalone EXE with PyInstaller...
echo.

:: Check if spec references files that don't exist and use a simpler build if needed
if exist "assets\libusb\libusb-1.0.dll" (
    if exist "assets\zadig.exe" (
        if exist "assets\icon.ico" (
            echo [INFO] All assets present — using full spec file.
            "%PY%" -m PyInstaller --clean --noconfirm epson_l120_resetter.spec
        ) else (
            goto :simple_build
        )
    ) else (
        goto :simple_build
    )
) else (
    goto :simple_build
)
goto :after_build

:simple_build
echo [INFO] Some assets missing — building without them (no icon/no bundled libusb).
"%PY%" -m PyInstaller ^
    --onefile ^
    --windowed ^
    --name "EPSON_L120_Resetter" ^
    --uac-admin ^
    --clean ^
    --noconfirm ^
    epson_l120_resetter.py

:after_build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] PyInstaller build failed. See output above.
    pause & exit /b 1
)

:: ── Verify EXE was created ────────────────────────────────────────────────
if not exist "dist\EPSON_L120_Resetter.exe" (
    echo [ERROR] EXE not found at dist\EPSON_L120_Resetter.exe
    pause & exit /b 1
)
echo.
echo [OK]   EXE built successfully: dist\EPSON_L120_Resetter.exe

:: ── Inno Setup — Build installer ─────────────────────────────────────────
echo.
echo [....] Looking for Inno Setup Compiler...

set ISCC=
for %%I in (
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    "C:\Program Files\Inno Setup 6\ISCC.exe"
    "C:\Users\%USERNAME%\AppData\Local\Programs\Inno Setup 6\ISCC.exe"
    "C:\Program Files (x86)\Inno Setup 5\ISCC.exe"
    "C:\Program Files\Inno Setup 5\ISCC.exe"
) do (
    if exist %%~I (
        set ISCC=%%~I
        goto :found_iscc
    )
)

echo [WARN] Inno Setup not found.
echo        Download it FREE from: https://jrsoftware.org/isdl.php
echo        After installing, run  build.bat  again to create the setup.exe
echo.
echo ── BUILD SUMMARY ───────────────────────────────────────────
echo   Standalone EXE:  dist\EPSON_L120_Resetter.exe
echo   Installer:       (skipped — Inno Setup not installed)
echo ────────────────────────────────────────────────────────────
goto :done

:found_iscc
echo [OK]   Inno Setup found: %ISCC%
echo.
echo [....] Compiling installer...

if not exist "installer_output" mkdir installer_output
"%ISCC%" setup_installer.iss
if %errorlevel% neq 0 (
    echo [ERROR] Inno Setup compilation failed.
    pause & exit /b 1
)

echo.
echo ── BUILD COMPLETE ──────────────────────────────────────────
echo.
echo   Standalone EXE:  dist\EPSON_L120_Resetter.exe
if exist "installer_output\EPSON_L120_Resetter_Setup.exe" (
    echo   Installer EXE:   installer_output\EPSON_L120_Resetter_Setup.exe
)
echo.
echo ────────────────────────────────────────────────────────────

:done
echo.
echo Done! Press any key to exit.
pause >nul
