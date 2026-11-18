@echo off
REM Convenience wrapper so you can double-click this instead of opening PowerShell.
REM Runs Multiwatch in a dedicated browser window with background throttling
REM disabled and Windows sleep blocked while the window is open.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-multiwatch.ps1" %*
