# Rune del Drago

Enigma a circuiti per smartphone e tablet (PWA, HTML/JS senza dipendenze).

Ogni livello è una griglia di tessere ruotabili con canali: un tocco = una rotazione di 90°.
Il soffio di fuoco del drago deve raggiungere la porta della tana.
- Il **ghiaccio** blocca il fuoco finché un **fulmine** non lo spacca; il fulmine si scarica sul ghiaccio e non prosegue.
- Il fulmine parte dalle **rune del tuono**; se tocca il drago o la porta il livello fallisce.
- Le **rocce** non si ruotano.

I livelli sono generati proceduralmente e deterministicamente (il numero di livello è il seme):
lo stesso livello è identico su ogni dispositivo. Difficoltà crescente: griglia 4×4 → 8×8, da 0 a 3 ghiacci.

## File
- `index.html` — pagina, stile, pannelli (regole, vittoria)
- `engine.js` — generazione livelli e simulazione degli elementi (puro, usabile anche in Node)
- `app.js` — rendering canvas, input touch, salvataggio progressi (localStorage)
- `fonts/` — Cinzel (OFL) per il titolo, incluso per l'uso offline
- `sw.js`, `manifest.webmanifest`, `icons/` — installazione come app e uso offline
- `test/verify.js` — verifica che N livelli siano generabili, risolvibili e non già risolti

## Avvio
Servire la cartella con un qualsiasi server statico, es. `npx serve .` oppure `python -m http.server`,
poi aprire l'indirizzo dal telefono (stessa rete) e "Aggiungi a schermata Home".

## Test
```
node test/verify.js 500
```
