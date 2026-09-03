@echo off
echo Building Auto Cursor Replay Windows Companion (C++)...

where cl.exe >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo Compiling with MSVC (cl.exe)...
    cl.exe /EHsc /O2 auto_cursor_host.cpp /link User32.lib /out:auto_cursor_host.exe
    goto done
)

where g++.exe >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo Compiling with MinGW (g++)...
    g++ -O2 auto_cursor_host.cpp -luser32 -o auto_cursor_host.exe
    goto done
)

echo No C++ compiler (cl.exe or g++) found in PATH.
echo Python runner auto_cursor_host.py will be used by default via auto_cursor_host.bat.

:done
echo Build process complete.
