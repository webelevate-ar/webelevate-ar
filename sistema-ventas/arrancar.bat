@echo off
REM Doble clic para levantar el sistema de ventas.
REM Hace todo lo que haga falta: instalar, crear la base, cargar los datos
REM de muestra y abrir el servidor. Los pasos que ya estan hechos se saltean.
cd /d "%~dp0"
npm run arrancar
pause
