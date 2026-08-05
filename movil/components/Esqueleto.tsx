import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { KnownPoseLandmarkConnections } from 'react-native-mediapipe-posedetection';
import { C } from '../lib/theme';

export type Punto = { x: number; y: number };

/**
 * Esqueleto sobre la cámara, dibujado con Skia.
 *
 * La primera versión usaba una View por punto y otra por hueso: 63 vistas de
 * React reconciliándose doce veces por segundo, encima del pipeline de la
 * cámara. Paulina lo notó de inmediato — la revisión se sentía lenta.
 *
 * Skia dibuja todo en UNA superficie nativa: un solo Path con los 30 huesos y
 * los círculos de los puntos. React deja de reconciliar decenas de nodos y solo
 * repinta un canvas.
 */
function EsqueletoBase({ puntos }: { puntos: Punto[] }) {
  const huesos = useMemo(() => {
    if (puntos.length < 25) return null;
    const path = Skia.Path.Make();

    for (const [a, b] of KnownPoseLandmarkConnections as number[][]) {
      const p = puntos[a];
      const q = puntos[b];
      if (!p || !q) continue;

      // Un hueso de largo absurdo casi siempre es un punto mal detectado.
      // Se omite en vez de dibujar una línea cruzando la pantalla.
      const largo = Math.hypot(q.x - p.x, q.y - p.y);
      if (largo < 1 || largo > 700) continue;

      path.moveTo(p.x, p.y);
      path.lineTo(q.x, q.y);
    }
    return path;
  }, [puntos]);

  if (!huesos) return null;

  return (
    <Canvas style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Path
        path={huesos}
        style="stroke"
        strokeWidth={3}
        strokeCap="round"
        strokeJoin="round"
        color={C.cyan}
        opacity={0.9}
      />
      {puntos.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={4.5} color={C.electrico} />
      ))}
    </Canvas>
  );
}

export const Esqueleto = memo(EsqueletoBase);
