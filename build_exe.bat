@echo off
setlocal enabledelayedexpansion
title Radio Network Management System - Standalone EXE Generator
echo =====================================================================
echo   RADIO NETWORK MANAGEMENT SYSTEM v1.0 - DESKTOP EXE BUILDER
echo   Developer: Tauqeer Aslam (TAUQEERASLAM50@gmail.com)
echo =====================================================================
echo.
echo [1/3] Checking Node.js and NPM environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this machine.
    echo Please install Node.js from https://nodejs.org/ then re-run this script.
    pause
    exit /b 1
)

echo [2/3] Installing and compiling standalone production assets...
call npm install
call npm run build

if not exist "dist\index.html" (
    echo [ERROR] Build failed. dist\index.html not generated.
    pause
    exit /b 1
)

echo.
echo [3/3] Packaging into standalone Windows Executable (.exe)...
echo Installing electron & electron-builder packaging tools...
call npm install --save-dev electron electron-builder

echo.
echo Compiling NSIS Installer and Portable .EXE...
call npx electron-builder --win nsis portable

echo.
if exist "release" (
    echo =====================================================================
    echo   [SUCCESS] Standalone EXE created successfully!
    echo   Output directory: release\
    echo =====================================================================
    echo.
    echo Opening release folder in Windows Explorer...
    explorer release
) else (
    echo [NOTICE] If electron-builder encountered network limits, you can
    echo launch immediately without installation using: start_offline.bat
)

pause
