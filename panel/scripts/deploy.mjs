/*
 * Sube el sitio ya construido a app.kineview.cl por FTP.
 *
 *   npm run build
 *   npm run deploy            # sube de verdad
 *   npm run deploy -- --dry   # solo lista qué subiría, no toca el servidor
 *
 * Sube ÚNICAMENTE `.output/public` — que es el sitio estático. El `.output/server`
 * (el bundle de Node) no se sube: el hosting no lo ejecuta y solo confundiría.
 *
 * Las credenciales salen de `.env`, que está en .gitignore.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Client } from "basic-ftp";

// fileURLToPath decodifica la URL. Con `new URL(...).pathname` los espacios
// quedan como %20 y la ruta no existe — se nota solo cuando el proyecto
// vive en una carpeta con espacios, como las de OneDrive.
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LOCAL = join(RAIZ, ".output", "public");
const SECO = process.argv.includes("--dry");

// Archivos que se generan en el build pero no aportan nada en el servidor.
const EXCLUIR = new Set(["pages.json"]);

async function cargarEnv() {
  const texto = await readFile(join(RAIZ, ".env"), "utf8").catch(() => {
    throw new Error("Falta el archivo .env — cópialo de .env.example y rellénalo.");
  });
  const env = {};
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const i = limpia.indexOf("=");
    if (i === -1) continue;
    env[limpia.slice(0, i).trim()] = limpia.slice(i + 1).trim();
  }
  for (const clave of ["FTP_HOST", "FTP_USER", "FTP_PASSWORD"]) {
    if (!env[clave]) throw new Error(`Falta ${clave} en .env`);
  }
  return env;
}

async function listarArchivos(dir) {
  const salida = [];
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      salida.push(...(await listarArchivos(ruta)));
    } else if (!EXCLUIR.has(entrada.name)) {
      salida.push(ruta);
    }
  }
  return salida;
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

async function main() {
  if (!(await stat(LOCAL).catch(() => null))) {
    throw new Error(`No existe ${LOCAL}. Corre \`npm run build\` primero.`);
  }

  const env = await cargarEnv();
  const archivos = await listarArchivos(LOCAL);
  const total = (await Promise.all(archivos.map(async (f) => (await stat(f)).size))).reduce(
    (a, b) => a + b,
    0,
  );

  console.log(`\nSitio:    ${LOCAL}`);
  console.log(`Destino:  ftp://${env.FTP_HOST}${env.FTP_REMOTE_DIR || "/"}`);
  console.log(`Archivos: ${archivos.length}  (${kb(total)})\n`);

  for (const f of archivos.sort()) {
    console.log(`  ${posix.join("/", relative(LOCAL, f).split("\\").join("/"))}`);
  }

  if (SECO) {
    console.log("\n--dry: no se subió nada.\n");
    return;
  }

  const cliente = new Client(30_000);
  cliente.ftp.verbose = false;
  try {
    // Se INTENTA FTPS explícito primero, siempre. Solo si el servidor lo
    // rechaza se cae a FTP plano — y se avisa fuerte, porque en plano la
    // contraseña viaja legible por la red.
    //
    // El 5 de agosto de 2026 el hosting empezó a responder 504 a AUTH TLS
    // pese a anunciar [TLS] en el banner (y el 990 cerrado). De ahí este
    // fallback: sin él no había forma de publicar.
    const conectar = (secure) =>
      cliente.access({
        host: env.FTP_HOST,
        port: Number(env.FTP_PORT || 21),
        user: env.FTP_USER,
        password: env.FTP_PASSWORD,
        secure,
        secureOptions: { rejectUnauthorized: false },
      });

    try {
      await conectar(true);
    } catch (e) {
      console.warn(
        `\n  ⚠ El servidor rechazó FTPS (${e.message}).` +
          `\n  ⚠ Subiendo en FTP PLANO: usuario y contraseña viajan sin cifrar.` +
          `\n  ⚠ Cambia la contraseña del FTP después de usar una red que no controles.\n`,
      );
      await conectar(false);
    }

    const destino = env.FTP_REMOTE_DIR || "/";
    if (destino !== "/") await cliente.ensureDir(destino);

    cliente.trackProgress((info) => {
      if (info.name) process.stdout.write(`\r  subiendo ${info.name}          `);
    });

    await cliente.uploadFromDir(LOCAL, destino);
    cliente.trackProgress();

    console.log(`\n\nListo. ${archivos.length} archivos en https://app.kineview.cl/\n`);
  } finally {
    cliente.close();
  }
}

main().catch((e) => {
  console.error(`\nFalló el despliegue: ${e.message}\n`);
  process.exit(1);
});
