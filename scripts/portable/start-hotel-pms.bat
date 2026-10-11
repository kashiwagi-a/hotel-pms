@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem 初回だけ、空のデータベース（客室マスタ入り）を data フォルダに用意する
if not exist "data" mkdir "data"
if not exist "data\hotel.db" copy "template.db" "data\hotel.db" >nul

rem Prisma には / 区切りの絶対パスで渡す
set "DBFILE=%~dp0data\hotel.db"
set "DBFILE=%DBFILE:\=/%"
set "DATABASE_URL=file:%DBFILE%"
if "%PORT%"=="" set "PORT=3000"
set "HOSTNAME=127.0.0.1"
set "NODE_ENV=production"
set "NEXT_TELEMETRY_DISABLED=1"

echo.
echo  宿泊管理を起動しています。
echo  このウィンドウを閉じると終了します。
echo  ブラウザが開かないときは http://localhost:%PORT% を開いてください。
echo.
if not defined HOTEL_PMS_NO_BROWSER start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:%PORT%"
"%~dp0runtime\node.exe" "%~dp0app\server.js"
echo.
echo  終了しました。
pause
