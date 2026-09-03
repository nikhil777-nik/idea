@echo off
if exist "C:\Users\javitha\AppData\Local\Programs\Python\Python313\python.exe" (
    "C:\Users\javitha\AppData\Local\Programs\Python\Python313\python.exe" "%~dp0auto_cursor_host.py" %*
) else (
    python "%~dp0auto_cursor_host.py" %*
)
