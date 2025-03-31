@echo off
setlocal

:: Imposta l'URL per scaricare l'ultima versione stabile di Node.js
set NODE_URL=https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi

:: Scarica l'installer di Node.js
echo Scaricando l'ultima versione stabile di Node.js...
powershell -Command "Invoke-WebRequest -Uri %NODE_URL% -OutFile node-latest-x64.msi"

:: Installa Node.js
echo Installando Node.js...
msiexec /i node-latest-x64.msi /quiet

:: Rimuovi l'installer dopo l'installazione
del node-latest-x64.msi

:: Aggiungi Node.js e npm al PATH
set NODE_PATH=C:\Program Files\nodejs
setx PATH "%PATH%;%NODE_PATH%"

:: Verifica se npm è installato
echo Verificando l'installazione di npm...
npm -v >nul 2>&1
if %errorlevel% neq 0 (
    echo npm non è stato trovato. Installazione di npm...
    npm install -g npm
)

echo Node.js installato con successo!

:: Installa le dipendenze da package.json
echo Installando le dipendenze da package.json...
npm install

echo Dipendenze installate con successo!

pause
endlocal