@echo off
title PhilSys Packet Monitoring Setup
echo ===================================================
echo   PhilSys Packet Monitoring - First Time Setup
echo ===================================================
echo.
echo Installing required dependencies...
call npm install

echo.
echo Initializing local database...
call npx prisma db push

echo.
echo Creating default Admin account...
call npm run db:seed

echo.
echo ===================================================
echo Setup Complete! 
echo You can now double-click "Start_PhilSys.bat" to run the app.
echo ===================================================
pause
