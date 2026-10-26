@echo off
rem Startet den lokalen Server und oeffnet das Spiel im Standardbrowser.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8080 -Open
