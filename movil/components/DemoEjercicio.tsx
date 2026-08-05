import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { C, R } from '../lib/theme';

// ═══════════════════════════════════════════════════════════════════════════
// Demostración animada del ejercicio.
//
// Observación de Paulina: la app tenía demasiado texto para su usuario real —
// una persona mayor, muchas veces sola y a veces con secuelas cognitivas o de
// lenguaje después del ACV. Tres párrafos explicando cómo mover un brazo son
// tres párrafos que no se van a leer.
//
// Un monito que hace el ejercicio delante enseña en cinco segundos lo que el
// texto no logra, y además muestra el ritmo: sube lento, MANTIENE tres
// segundos, baja lento. El sostén deja de ser una regla escrita y pasa a ser
// algo que se ve.
// ═══════════════════════════════════════════════════════════════════════════

const SUBIDA_MS = 1800;
const SOSTEN_MS = 3000;
const BAJADA_MS = 1800;
const PAUSA_MS = 900;
const CICLO = SUBIDA_MS + SOSTEN_MS + BAJADA_MS + PAUSA_MS;

const ANGULO_MAX = 155;

type Fase = 'sube' | 'manten' | 'baja' | 'pausa';

function estadoEn(t: number): { angulo: number; fase: Fase; restante: number } {
  const ms = t % CICLO;
  if (ms < SUBIDA_MS) {
    return { angulo: (ms / SUBIDA_MS) * ANGULO_MAX, fase: 'sube', restante: 0 };
  }
  if (ms < SUBIDA_MS + SOSTEN_MS) {
    const dentro = ms - SUBIDA_MS;
    return {
      angulo: ANGULO_MAX,
      fase: 'manten',
      restante: Math.ceil((SOSTEN_MS - dentro) / 1000),
    };
  }
  if (ms < SUBIDA_MS + SOSTEN_MS + BAJADA_MS) {
    const dentro = ms - SUBIDA_MS - SOSTEN_MS;
    return { angulo: ANGULO_MAX * (1 - dentro / BAJADA_MS), fase: 'baja', restante: 0 };
  }
  return { angulo: 0, fase: 'pausa', restante: 0 };
}

const ROTULO: Record<Fase, string> = {
  sube: 'Sube el brazo despacio',
  manten: 'Mantén arriba',
  baja: 'Baja despacio',
  pausa: 'Y otra vez',
};

/**
 * Monito sentado de perfil. El brazo del lado afectado sube, se mantiene y
 * baja, con el mismo ritmo que la app va a medir.
 */
export function DemoEjercicio({
  lado = 'derecho',
  alto = 190,
}: {
  lado?: 'izquierdo' | 'derecho';
  alto?: number;
}) {
  const [t, setT] = useState(0);
  const inicio = useRef(Date.now());

  useEffect(() => {
    // 20 fps: suficiente para que se vea fluido y barato al lado del pipeline
    // de la cámara, que es lo caro de esta pantalla.
    const id = setInterval(() => setT(Date.now() - inicio.current), 50);
    return () => clearInterval(id);
  }, []);

  const { angulo, fase, restante } = estadoEn(t);

  const ancho = alto * 1.15;
  const cx = ancho / 2;
  const escala = alto / 200;

  // Puntos base del monito, en un lienzo de 200 de alto.
  const cabezaY = 42 * escala;
  const hombroY = 78 * escala;
  const caderaY = 138 * escala;
  const rodillaY = 168 * escala;
  const largoBrazo = 52 * escala;

  // El brazo cuelga a 0° y sube hacia adelante. El signo invierte el lado.
  const signo = lado === 'derecho' ? 1 : -1;
  const rad = ((angulo - 90) * Math.PI) / 180;
  const manoX = cx + signo * Math.cos(rad) * largoBrazo;
  const manoY = hombroY + Math.sin(rad) * largoBrazo;

  const cuerpo = Skia.Path.Make();
  cuerpo.moveTo(cx, hombroY);
  cuerpo.lineTo(cx, caderaY);
  // Muslo y pierna: está sentado.
  cuerpo.moveTo(cx, caderaY);
  cuerpo.lineTo(cx + signo * 40 * escala, caderaY);
  cuerpo.moveTo(cx + signo * 40 * escala, caderaY);
  cuerpo.lineTo(cx + signo * 40 * escala, rodillaY);
  // Brazo que NO trabaja: cuelga.
  cuerpo.moveTo(cx, hombroY);
  cuerpo.lineTo(cx - signo * 6 * escala, hombroY + largoBrazo * 0.85);

  const brazo = Skia.Path.Make();
  brazo.moveTo(cx, hombroY);
  brazo.lineTo(manoX, manoY);

  return (
    <View style={d.caja}>
      <Canvas style={{ width: ancho, height: alto }}>
        {/* Silla, para que se entienda que es sentado */}
        <Path
          path={(() => {
            const s = Skia.Path.Make();
            s.moveTo(cx - signo * 12 * escala, caderaY + 4 * escala);
            s.lineTo(cx - signo * 12 * escala, rodillaY + 14 * escala);
            s.moveTo(cx - signo * 14 * escala, caderaY + 4 * escala);
            s.lineTo(cx + signo * 44 * escala, caderaY + 4 * escala);
            return s;
          })()}
          style="stroke"
          strokeWidth={3}
          strokeCap="round"
          color={C.borde}
        />
        <Path path={cuerpo} style="stroke" strokeWidth={7} strokeCap="round" color={C.marino} />
        <Path path={brazo} style="stroke" strokeWidth={8} strokeCap="round" color={C.electrico} />
        <Circle cx={cx} cy={cabezaY} r={18 * escala} color={C.marino} />
        <Circle cx={manoX} cy={manoY} r={7 * escala} color={C.cyan} />
      </Canvas>

      <View style={[d.rotulo, fase === 'manten' && d.rotuloFuerte]}>
        <Text style={[d.rotuloTexto, fase === 'manten' && d.rotuloTextoFuerte]}>
          {fase === 'manten' ? `${ROTULO.manten}… ${restante}` : ROTULO[fase]}
        </Text>
      </View>
    </View>
  );
}

const d = StyleSheet.create({
  caja: { alignItems: 'center', gap: 10 },
  rotulo: {
    backgroundColor: C.hielo,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  rotuloFuerte: { backgroundColor: C.electrico },
  rotuloTexto: { fontSize: 16, fontWeight: '700', color: C.marino },
  rotuloTextoFuerte: { color: C.blanco },
});

export const R_DEMO = R;
