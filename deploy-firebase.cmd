@echo off
chcp 65001 >nul
title نشر منصة المجتمع على Firebase Hosting
cd /d "%~dp0"
echo.
echo ==========================================
echo   منصة المجتمع v187 - Firebase Hosting
echo ==========================================
echo.
where firebase >nul 2>nul
if errorlevel 1 (
  echo Firebase CLI غير مثبت.
  echo نفذ أولا: npm install -g firebase-tools
  pause
  exit /b 1
)
set /p PROJECT_ID=اكتب Firebase Project ID: 
if "%PROJECT_ID%"=="" (
  echo لم يتم إدخال Project ID.
  pause
  exit /b 1
)
firebase deploy --only hosting --project "%PROJECT_ID%"
echo.
pause
