#!/usr/bin/env node
/**
 * Descarga el modelo BlazePose del CDN público de Google.
 *
 * Corre como `postinstall`, así que ocurre solo tanto en este equipo como en
 * los servidores de EAS Build. Eso resuelve un problema concreto: el .task pesa
 * 5,7 MB y no se versiona, de modo que un build en la nube clonaría el repo sin
 * él y el config plugin no tendría nada que copiar a los assets nativos.
 *
 * Node puro y sin dependencias: en el contenedor de EAS no hay curl garantizado
 * y `npm ci` corre antes que cualquier otra cosa.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

const destino = path.join(__dirname, '..', 'assets', 'models', 'pose_landmarker_lite.task');
const TAMANO_MINIMO = 4 * 1024 * 1024; // el modelo real ronda los 5,7 MB

if (fs.existsSync(destino) && fs.statSync(destino).size > TAMANO_MINIMO) {
  console.log('[modelo] ya está descargado, no se hace nada.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(destino), { recursive: true });

function bajar(url, intentosRestantes) {
  https
    .get(url, (res) => {
      // El CDN redirige; hay que seguirlo a mano.
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return bajar(res.headers.location, intentosRestantes);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return fallar(new Error(`HTTP ${res.statusCode}`), intentosRestantes);
      }

      // Se escribe a un archivo temporal y se renombra al final: si la descarga
      // se corta, no queda un .task truncado que parezca válido. (Un NDK a
      // medio bajar ya nos costó una hora en este proyecto.)
      const temporal = `${destino}.parcial`;
      const salida = fs.createWriteStream(temporal);
      res.pipe(salida);
      salida.on('finish', () => {
        salida.close(() => {
          const bytes = fs.statSync(temporal).size;
          if (bytes < TAMANO_MINIMO) {
            fs.unlinkSync(temporal);
            return fallar(new Error(`descarga incompleta (${bytes} bytes)`), intentosRestantes);
          }
          fs.renameSync(temporal, destino);
          console.log(`[modelo] descargado: ${(bytes / 1048576).toFixed(1)} MB`);
        });
      });
      salida.on('error', (e) => fallar(e, intentosRestantes));
    })
    .on('error', (e) => fallar(e, intentosRestantes));
}

function fallar(error, intentosRestantes) {
  if (intentosRestantes > 0) {
    console.warn(`[modelo] falló (${error.message}); reintentando…`);
    return setTimeout(() => bajar(URL, intentosRestantes - 1), 3000);
  }
  console.error(`[modelo] no se pudo descargar: ${error.message}`);
  console.error('[modelo] descárgalo a mano con: npm run modelo');
  process.exit(1);
}

bajar(URL, 4);
