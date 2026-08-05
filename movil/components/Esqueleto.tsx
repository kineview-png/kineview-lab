import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { KnownPoseLandmarkConnections } from 'react-native-mediapipe-posedetection';
import { C } from '../lib/theme';

export type Punto = { x: number; y: number };

/**
 * Esqueleto de 33 puntos sobre la cámara.
 *
 * Cada hueso es una View delgada rotada: se calcula el largo y el ángulo entre
 * los dos puntos y se coloca centrada en el medio del segmento, porque el
 * `rotate` de React Native gira alrededor del centro de la vista.
 *
 * Se hace con vistas y no con Skia a propósito: son 30 huesos repintados a
 * ~12 fps, algo que el renderer nativo resuelve sin despeinarse, y así el
 * overlay no depende de una librería gráfica que también tendría que compilar.
 * Si algún día se quiere dibujar el rastro del movimiento o un degradado, ahí
 * sí vale la pena mover esto a Skia.
 */
function EsqueletoBase({ puntos }: { puntos: Punto[] }) {
  if (puntos.length < 25) return null;

  return (
    <>
      {(KnownPoseLandmarkConnections as number[][]).map(([a, b], i) => {
        const p = puntos[a];
        const q = puntos[b];
        if (!p || !q) return null;

        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const largo = Math.hypot(dx, dy);

        // Un hueso de largo cero o absurdo suele ser un punto mal detectado.
        // Se omite en vez de dibujar una línea que cruza la pantalla.
        if (largo < 1 || largo > 700) return null;

        const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;

        return (
          <View
            key={`h${i}`}
            pointerEvents="none"
            style={[
              e.hueso,
              {
                width: largo,
                left: (p.x + q.x) / 2 - largo / 2,
                top: (p.y + q.y) / 2 - 1.5,
                transform: [{ rotate: `${angulo}deg` }],
              },
            ]}
          />
        );
      })}

      {puntos.map((p, i) => (
        <View key={`p${i}`} pointerEvents="none" style={[e.punto, { left: p.x - 4, top: p.y - 4 }]} />
      ))}
    </>
  );
}

const e = StyleSheet.create({
  hueso: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: C.cyan,
    opacity: 0.9,
  },
  punto: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.electrico,
    borderWidth: 1.5,
    borderColor: C.blanco,
  },
});

export const Esqueleto = memo(EsqueletoBase);
