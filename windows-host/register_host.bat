@echo off
setlocal enabledelayedexpansion

set MANIFEST_PATH=%~dp0com.auto_cursor_replay.host.json
set REG_KEY=HKCU\Software\Google\Chrome\NativeMessagingHosts\com.auto_cursor_replay.host

echo Registering Auto Cursor Replay Native Host in Windows Registry...
echo Manifest Path: %MANIFEST_PATH%
echo Registry Key: %REG_KEY%

REG ADD "%REG_KEY%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f

if %ERRORLEVEL% == 0 (
    echo.
    echo ========================================================
    echo SUCCESS: Native Messaging Host registered in Windows Registry!
    echo ========================================================
) else (
    echo.
    echo ERROR: Failed to register Native Messaging Host in Registry.
)
pause
