/*
 * Publica el APK compilado en https://app.kineview.cl/kineview.apk
 *
 *   node scripts/subir-apk.mjs                  # toma el último build FINISHED
 *   node scripts/subir-apk.mjs <build-id>       # toma uno específico
 *
 * Por qué el APK vive en nuestro dominio y no en el link de EAS:
 *
 *  · La URL de EAS es un hash de 43 caracteres. No se dicta en voz alta, no se
 *    escribe a mano en un Android y no cabe decente en un QR.
 *  · El artefacto de EAS caduca. El dominio no.
 *  · El QR del sitio apunta a la URL corta, así que el QR no hay que
 *    regenerarlo cada vez que se compila: se reemplaza el archivo y listo.
 *
 * El destino es la RAÍZ del hosting, junto al sitio de marketing. El deploy del
 * sitio sube archivos pero no borra los que no conoce, así que el APK sobrevive
 * a los despliegues.
 */
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Client } from "basic-ftp";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const MOVIL = join(RAIZ, "..", "movil");
const NOMBRE_REMOTO = "kineview.apk";

/*
 * El script vive en `panel/` y no en `movil/` aunque publique el APK: acá ya
 * están las credenciales del hosting y `basic-ftp`, y no vale la pena meterle
 * una dependencia de FTP al proyecto de Expo — cada dependencia que se agrega
 * ahí también se instala en cada build de EAS.
 */
const ENV_FTP = join(RAIZ, ".env");

async function cargarEnv() {
  const texto = await readFile(ENV_FTP, "utf8").catch(() => {
    throw new Error(`No encontré ${ENV_FTP} — ahí viven las credenciales del FTP.`);
  });
  const env = {};
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const i = limpia.indexOf("=");
    if (i !== -1) env[limpia.slice(0, i).trim()] = limpia.slice(i + 1).trim();
  }
  for (const clave of ["FTP_HOST", "FTP_USER", "FTP_PASSWORD"]) {
    if (!env[clave]) throw new Error(`Falta ${clave} en ${ENV_FTP}`);
  }
  return env;
}

function eas(args) {
  return execFileSync("eas", args, {
    cwd: MOVIL,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function buscarBuild(id) {
  if (id) {
    const b = JSON.parse(eas(["build:view", id, "--json"]));
    if (b.status !== "FINISHED") throw new Error(`El build ${id} está en ${b.status}, no FINISHED.`);
    return b;
  }
  const lista = JSON.parse(eas(["build:list", "--limit", "10", "--json", "--non-interactive"]));
  // Solo `preview`/`production`: un build de development necesita Metro
  // corriendo en la misma red y sería inútil para quien lo descargue.
  const util = lista.find(
    (b) =>
      b.status === "FINISHED" &&
      b.buildProfile !== "development" &&
      b.artifacts?.applicationArchiveUrl,
  );
  if (!util) throw new Error("No hay ningún build FINISHED que no sea de development.");
  return util;
}

async function main() {
  const build = buscarBuild(process.argv[2]);
  const url = build.artifacts.applicationArchiveUrl;

  console.log(`\nBuild:   ${build.id}`);
  console.log(`Perfil:  ${build.buildProfile}`);
  console.log(`Origen:  ${url}\n`);

  const dir = await mkdtemp(join(tmpdir(), "kineview-apk-"));
  const local = join(dir, NOMBRE_REMOTO);

  try {
    process.stdout.write("Descargando de EAS… ");
    const r = await fetch(url);
    if (!r.ok) throw new Error(`EAS respondió ${r.status}`);
    await pipeline(Readable.fromWeb(r.body), createWriteStream(local));
    const mb = ((await stat(local)).size / 1024 / 1024).toFixed(1);
    console.log(`${mb} MB`);

    const env = await cargarEnv();
    const cliente = new Client(120_000);
    try {
      const conectar = (secure) =>
        cliente.access({
          host: env.FTP_HOST,
          port: Number(env.FTP_PORT || 21),
          user: env.FTP_USER,
          password: env.FTP_PASSWORD,
          secure,
          secureOptions: { rejectUnauthorized: false },
        });

      // Mismo criterio que el deploy del panel: FTPS primero, y si el hosting
      // lo rechaza se avisa antes de mandar la contraseña en claro.
      try {
        await conectar(true);
      } catch (e) {
        console.warn(`\n  ⚠ El servidor rechazó FTPS (${e.message}). Subiendo en FTP plano.\n`);
        await conectar(false);
      }

      process.stdout.write("Subiendo al hosting… ");
      await cliente.uploadFrom(local, `/${NOMBRE_REMOTO}`);
      console.log("listo");
    } finally {
      cliente.close();
    }

    console.log(`\n  https://app.kineview.cl/${NOMBRE_REMOTO}\n`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(`\nFalló: ${e.message}\n`);
  process.exit(1);
});
