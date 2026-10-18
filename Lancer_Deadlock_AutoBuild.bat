@echo off
title Deadlock Blueprint
cd /d "%~dp0"
echo Lancement de Deadlock Blueprint...
if not exist "dist\index.html" (
    echo Compilation initiale de l'interface...
    call npm run build
)
rem Lance electron.exe directement (application fenetree) : pas de console noire remplie de messages
rem "wgc_capturer_win.cc ... Failed to start capture" (fenetres Windows non capturables, sans effet sur la detection)
start "" "node_modules\electron\dist\electron.exe" .
