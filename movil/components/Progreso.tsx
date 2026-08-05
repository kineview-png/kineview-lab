import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { C, R } from '../lib/theme';
import {
  cambioReciente, frasePaciente, proyectar, type PuntoProgreso,
} from '../lib/progreso';

/**
 * Progreso del paciente: la curva de su rango y hacia dónde va.
 *
 * La línea llena es lo que ya hizo; la punteada, la proyección. Se dibujan
 * distinto a propósito: una es un registro y la otra es una estimación, y
 * mezclarlas visualmente sería presentar una suposición como un hecho.
 */
export function TarjetaProgreso({ puntos }: { puntos: PuntoProgreso[] }) {
  const proyeccion = proyectar(puntos);
  const cambio = cambioReciente(puntos);
  const frase = frasePaciente(proyeccion, cambio);

  const ancho = 300;
  const alto = 110;
  const pad = 8;

  const grafico = (() => {
    if (puntos.length < 2) return null;

    const valores = puntos.map((p) => p.rom);
    const proyectado = proyeccion.hay ? proyeccion.enCuatroSemanas : null;
    const max = Math.max(...valores, proyectado ?? 0) * 1.08;
    const min = Math.min(...valores, proyectado ?? Infinity) * 0.9;
    const rango = Math.max(1, max - min);

    // Si hay proyección, el eje x reserva un tercio para el futuro.
    const anchoHistoria = proyectado !== null ? ancho * 0.66 : ancho;
    const y = (v: number) => pad + (1 - (v - min) / rango) * (alto - pad * 2);
    const x = (i: number) => (i / Math.max(1, puntos.length - 1)) * (anchoHistoria - pad) + pad / 2;

    const linea = Skia.Path.Make();
    puntos.forEach((p, i) => (i === 0 ? linea.moveTo(x(i), y(p.rom)) : linea.lineTo(x(i), y(p.rom))));

    let futuro: ReturnType<typeof Skia.Path.Make> | null = null;
    if (proyectado !== null) {
      futuro = Skia.Path.Make();
      futuro.moveTo(x(puntos.length - 1), y(valores[valores.length - 1]));
      futuro.lineTo(ancho - pad, y(proyectado));
    }

    return {
      linea,
      futuro,
      ultimoX: x(puntos.length - 1),
      ultimoY: y(valores[valores.length - 1]),
      finX: ancho - pad,
      finY: proyectado !== null ? y(proyectado) : 0,
    };
  })();

  return (
    <View style={p.caja}>
      <Text style={p.etiqueta}>Tu progreso</Text>

      {grafico ? (
        <Canvas style={{ width: ancho, height: alto }}>
          <Path
            path={grafico.linea}
            style="stroke"
            strokeWidth={3}
            strokeCap="round"
            strokeJoin="round"
            color={C.electrico}
          />
          {grafico.futuro && (
            <Path
              path={grafico.futuro}
              style="stroke"
              strokeWidth={3}
              strokeCap="round"
              color={C.cyan}
              opacity={0.65}
            />
          )}
          <Circle cx={grafico.ultimoX} cy={grafico.ultimoY} r={5} color={C.electrico} />
          {grafico.futuro && (
            <Circle cx={grafico.finX} cy={grafico.finY} r={5} color={C.cyan} opacity={0.8} />
          )}
        </Canvas>
      ) : (
        <Text style={p.texto}>Tu curva aparecerá cuando tengas un par de sesiones.</Text>
      )}

      <Text style={p.texto}>{frase}</Text>

      {proyeccion.hay && (
        <Text style={p.nota}>
          Es una estimación a partir de tus propias sesiones, no una promesa médica.
        </Text>
      )}
    </View>
  );
}

const p = StyleSheet.create({
  caja: {
    backgroundColor: C.blanco, borderRadius: R, padding: 18, gap: 10,
    borderWidth: 1, borderColor: C.borde, alignItems: 'flex-start',
  },
  etiqueta: {
    fontSize: 12, fontWeight: '800', color: C.electrico,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  texto: { fontSize: 16, color: C.texto, lineHeight: 23 },
  nota: { fontSize: 12.5, color: C.textoSuave, lineHeight: 18 },
});
