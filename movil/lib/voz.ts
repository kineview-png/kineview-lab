// ═══════════════════════════════════════════════════════════════════════════
// Voz que guía el ejercicio.
//
// Pedido de Paulina, y responde a un problema real de su usuario: mientras
// levanta el brazo, la persona está mirando su brazo — no la pantalla. Todo lo
// que la app escriba en ese momento no lo va a leer nadie. Una voz que cuenta
// el sostén y confirma la repetición llega igual con los ojos en otra parte, y
// para alguien con baja visión o poca alfabetización es la diferencia entre
// poder usar la app y no poder.
//
// ⚠️ `expo-speech` es un módulo NATIVO: no existe en un dev client que se haya
// compilado antes de instalarlo. Por eso el import va protegido — la app sigue
// funcionando sin voz en binarios viejos en vez de reventar al abrir.
// ═══════════════════════════════════════════════════════════════════════════

type ModuloVoz = {
  speak: (texto: string, opciones?: Record<string, unknown>) => void;
  stop: () => void;
};

let voz: ModuloVoz | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  voz = require('expo-speech') as ModuloVoz;
} catch {
  voz = null;
}

export const hayVoz = voz !== null;

let ultimaFrase = '';
let ultimaMs = 0;

/**
 * Dice algo, con dos frenos:
 *  - no repite la misma frase si acaba de decirla (el bucle de la cámara
 *    llamaría a esto treinta veces por segundo);
 *  - `interrumpe` corta lo que esté diciendo, para que el conteo no llegue
 *    tarde cuando la persona ya bajó el brazo.
 */
export function hablar(texto: string, opciones: { interrumpe?: boolean; minMs?: number } = {}) {
  if (!voz) return;
  const ahora = Date.now();
  const { interrumpe = false, minMs = 1500 } = opciones;

  if (texto === ultimaFrase && ahora - ultimaMs < minMs) return;
  ultimaFrase = texto;
  ultimaMs = ahora;

  if (interrumpe) voz.stop();
  voz.speak(texto, {
    language: 'es-CL',
    // Un poco más lento que el habla normal: el usuario es una persona mayor
    // que además está ejercitando.
    rate: 0.92,
    pitch: 1.0,
  });
}

export function callar() {
  voz?.stop();
  ultimaFrase = '';
}

/** Los números de las repeticiones, dichos como se dicen. */
const NUMEROS = [
  'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince',
];

export function decirRepeticion(n: number) {
  hablar(NUMEROS[n - 1] ? `${NUMEROS[n - 1]}` : `${n}`, { interrumpe: true, minMs: 300 });
}

export function decirInstruccionInicial(lado: 'izquierdo' | 'derecho') {
  hablar(
    `Siéntate derecho. Levanta el brazo ${lado} despacio, mantenlo arriba mientras cuento hasta tres, y bájalo con calma.`,
    { minMs: 8000 },
  );
}
