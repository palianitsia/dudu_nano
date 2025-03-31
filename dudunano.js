const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { SingleBar, Presets } = require('cli-progress');
const readline = require('readline');

// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; solo per debug

// Configurazione
const TELEGRAM_URL = 'https://t.me/s/puntateaste';

// User Agent per iPhone 16
const USER_AGENT = "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Mobile Safari/537.36";

// Funzione per creare i file necessari se non esistono
function createRequiredFiles() {
    const requiredFiles = ['./dess.txt', './log.txt'];

    requiredFiles.forEach(file => {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, '', 'utf8'); // Crea il file vuoto
        }
    });

    // Pulisci il contenuto di log.txt all'avvio
    fs.writeFileSync('./log.txt', '', 'utf8');
}

// Funzione per scrivere errori nel log
function logError(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync('log.txt', `[${timestamp}] ERROR: ${message}\n`, 'utf8');
}

// Funzione per leggere i DESS dal file
function readDessFromFile() {
    const data = fs.readFileSync('./dess.txt', 'utf8');
    return data.split('\n').map(line => line.trim()).filter(line => line);
}

// Funzione per il login
async function login(user) {
    const domainUrl = user.domain === "es" ? "https://es.bidoo.com" : "https://it.bidoo.com";
    
    for (let attempt = 1; attempt <= 5; attempt++) { // Prova fino a 5 volte
        try {
            const request = await axios.request({
                method: "GET",
                url: `${domainUrl}/ajax/get_logged_user.php`,
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                    "Pragma": "no-cache",
                    "Cookie": "dess=" + user.dess + ";",
                    "accept-language": user.domain === "es" ? "es" : "it", // Imposta accept-language in base al dominio
                    "User-Agent": USER_AGENT, // Imposta il User Agent
                },
                timeout: 20000, // Timeout di 20 secondi
            });

            return request.status === 200 && request.data.is_valid;
        } catch (error) {
            logError(`Errore durante il login (tentativo ${attempt}): ${error.message}`);
            if (attempt === 5) {
                return false; // Ritorna false se l'ultimo tentativo fallisce
            }
            // Attendi un breve periodo prima di riprovare
            await new Promise(resolve => setTimeout(resolve, 2000)); // Aspetta 2 secondi
        }
    }
}

// Funzione per estrarre i codici promozionali dai link
function extractPromocode(link) {
    if (link.includes('promocode=')) {
        const start = link.indexOf('promocode=') + 'promocode='.length;
        const end = link.indexOf('&', start);
        return end !== -1 ? link.substring(start, end) : link.substring(start);
    }
    return null;
}

// Funzione per estrarre i link da un canale Telegram
async function fetchTelegramLinks() {
    try {
        const response = await axios.get(TELEGRAM_URL, { timeout: 10000 }); // Timeout di 10 secondi
        const $ = cheerio.load(response.data);

        const promoLinks = [];
        $('a').each((_, element) => {
            const href = $(element).attr('href');
            if (href && href.includes('bidoo.com/')) {
                const promocode = extractPromocode(href);
                if (promocode) {
                    promoLinks.push(promocode);
                }
            }
        });

        // Rimuovi duplicati e limita a 30 codici
        return [...new Set(promoLinks)].slice(0, 30);
    } catch (error) {
        logError(`Errore durante il fetch dei link: ${error.message}`);
        return [];
    }
}

// Funzione per ottenere l'username
async function getUsername(user) {
    const domainUrl = user.domain === "es" ? "https://es.bidoo.com" : "https://it.bidoo.com";
    const url = `${domainUrl}/ajax/get_logged_user.php`;

    try {
        const response = await axios.get(url, {
            headers: {
                "Cookie": "dess=" + user.dess + ";",
                "User-Agent": USER_AGENT,
            },
            timeout: 10000,
        });

        if (response.status === 200 && response.data.is_valid) {
            return response.data.username;
        }
    } catch (error) {
        logError(`Errore durante il recupero dell'username: ${error.message}`);
    }
    return null;
}

// Funzione per ottenere il saldo
async function getSaldo(user) {
    const domainUrl = user.domain === "es" ? "https://es.bidoo.com" : "https://it.bidoo.com";
    const saldoUrl = `${domainUrl}/user_settings.php`;

    try {
        const response = await axios.get(saldoUrl, {
            headers: {
                "Cookie": "dess=" + user.dess + ";",
                "User-Agent": USER_AGENT,
            },
            timeout: 10000, // Timeout di 10 secondi
        });

        if (response.status === 200) {
            const $ = cheerio.load(response.data);
            const saldoElement = $('#divSaldoBidBottom'); // Assicurati che l'ID sia corretto
            return saldoElement.length ? parseInt(saldoElement.text().trim()) : 0;
        }
    } catch (error) {
        logError(`Errore durante il recupero del saldo: ${error.message}`);
    }
    return 0;
}

// Funzione per chiedere all'utente cosa vuole fare
async function askUserChoice() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question("Ciao, cosa vorresti fare? \n1. Riscuotere puntate \n2. Riscattare un codice \n3. Stampare saldi \n0. Esci \nInserisci il numero e premi invio: ", (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// Funzione per mostrare i dettagli degli account
async function showAccountDetails(users) {
    console.log("\nDettagli Account:");
    console.log("ID".padEnd(10) + "DESS".padEnd(50) + "Username".padEnd(20) + "Saldo");
    console.log("-----------------------------------------");

    let totalSaldo = 0; // Variabile per accumulare il totale dei saldi

    for (let index = 0; index < users.length; index++) {
        const user = users[index];
        const isLoggedIn = await login(user); // Esegui nuovamente il login
        if (isLoggedIn) {
            const username = await getUsername(user);
            const usernameStr = String(username ?? "N/A"); // Usa "N/A" se username è null o undefined
            const saldo = await getSaldo(user);
            totalSaldo += saldo;
            console.log(`${(index + 1).toString().padEnd(10)}${user.dess.padEnd(50)}${usernameStr.padEnd(20)}${saldo}`);
        }
    }

    console.log("-----------------------------------------");
    console.log(`IL Totale: ${totalSaldo}`);
}

async function redeemPromocodes(promocodes, user, progressBar) {
    const domainUrl = user.domain === "es" ? "https://es.bidoo.com" : "https://it.bidoo.com";
    const redeemedCodes = new Set(); // Set per tenere traccia dei codici già riscattati

    // Crea un array di promesse per ogni codice promozionale
    const promises = promocodes.map(async (promocode) => {
        if (redeemedCodes.has(promocode)) {
            return; // Salta se il codice è già stato riscattato
        }

        const promoUrl = `${domainUrl}/push_promotions.php?code=${promocode}`;
        
        try {
            const response = await axios.get(promoUrl, {
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                    "Pragma": "no-cache",
                    "Cookie": "dess=" + user.dess + ";",
                    "User-Agent": USER_AGENT, // Imposta il User Agent
                },
                timeout: 10000, // Timeout di 10 secondi
            });

            if (response.status === 200) {
                if (response.data.includes('expired')) {
                    // Puoi anche decidere di loggare i link scaduti se necessario
                    // console.log(`Link scaduto: ${promoUrl}`);
                } else {
                    redeemedCodes.add(promocode); // Aggiungi il codice al set dei riscattati
                }
            } else {
                // Non stampare errori specifici per il riscatto
                // console.log(`Errore nel riscatto del codice: ${promoUrl}`);
            }
        } catch (error) {
            // Non stampare errori specifici per il riscatto
            // console.log(`Errore durante il riscatto del codice ${promocode}: ${error.message}`);
        }

        // Aggiorna la barra di progresso
        progressBar.increment();
    });

    // Esegui tutte le promesse in parallelo
    await Promise.all(promises);
}

async function redeemCodeFromUrl(url, users, progressBar) {
    const promocode = extractPromocode(url);
    if (!promocode) {
        console.log("Nessun codice promozionale trovato nell'URL fornito.");
        return;
    }

    console.log(`Riscattando il codice promozionale: ${promocode}`);

    // Crea un array di promesse per ogni utente
    const promises = users.map(user => redeemPromocodes([promocode], user, progressBar)); // Passa un array con il solo promocode

    // Esegui tutte le promesse in parallelo
    await Promise.all(promises);
}

// Main
(async () => {
    createRequiredFiles(); // Crea i file necessari all'avvio
    const dessList = readDessFromFile();
    
    // Estrai i codici promozionali solo una volta
    const promocodes = await fetchTelegramLinks();

    // Rimuovi duplicati da DESS e crea oggetti utente
    const uniqueDess = [...new Set(dessList)];
    const users = uniqueDess.map(dess => {
        const [domain, code] = dess.split(':');
        return { domain, dess: code };
    });

    let continueRunning = true; // Variabile per controllare il ciclo

    while (continueRunning) {
        // Chiedi all'utente cosa vuole fare
        const userChoice = await askUserChoice();

        if (userChoice === '1') {
            // Inizializza la barra di progresso
            const progressBar = new SingleBar({}, Presets.shades_classic);
            progressBar.start(promocodes.length * users.length, 0); // Barra di progresso totale

            // Riscatta i codici per ogni utente
            for (const user of users) {
                await redeemPromocodes(promocodes, user, progressBar);
            }

            // Completa la barra di progresso
            progressBar.stop();
            console.log("Puntate riscosse con successo!!!!!!!");
        } else if (userChoice === '2') {
            // Chiedi all'utente di inserire l'URL del codice promozionale
            const url = await new Promise((resolve) => {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                rl.question("Inserisci l'URL del codice promozionale: ", (url) => {
                    rl.close();
                    resolve(url);
                });
            });

            const progressBar = new SingleBar({}, Presets.shades_classic);
            progressBar.start(users.length, 0); // Barra di progresso per il riscatto

            await redeemCodeFromUrl(url, users, progressBar);

            // Completa la barra di progresso
            progressBar.stop();
            console.log("Riscatto del codice completato.");
        } else if (userChoice === '3') {
            // Mostra i dettagli utente
            await showAccountDetails(users);
        } else if (userChoice === '0') {
            // Opzione per uscire
            continueRunning = false;
            console.log("Uscita dal programma. Grazie!");
        } else {
            console.log("Scelta non valida. Riprova.");
        }
    }
})();