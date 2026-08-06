import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, R } from '../lib/theme';
import { decirPregunta, hablar } from '../lib/voz';

// ═══════════════════════════════════════════════════════════════════════════
// Piezas clínicas de la app del paciente.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Escala EVA de 0 a 10, con cara.
 *
 * Corrección de Paulina: la escala tiene que ser la médica completa, 0 a 10,
 * "pero claro, con cara, donde 0 es sin dolor". Las dos cosas a la vez, y son
 * dos cosas distintas:
 *
 *  · Los ONCE puntos son innegociables. La versión anterior ofrecía solo pares
 *    (0-2-4-6-8-10) y eso no es EVA: es media escala. Además rompía justo el
 *    umbral que usa el agente para derivar —"dolor que sube 3 o más puntos"—
 *    porque con saltos de 2 un aumento real de 3 se registraba como 2 o como 4.
 *    La granularidad no era cosmética, era clínica.
 *
 *  · La cara es lo que la hace respondible. Pedirle a una persona mayor, a
 *    veces con afasia después de un ACV, que traduzca su dolor a un número
 *    abstracto es un trabajo cognitivo que no tiene por qué hacer. Acá el
 *    número lo elige ella, pero la cara y la palabra le dicen qué significa
 *    cada número mientras lo elige.
 *
 * Las bandas (leve 1-3, moderado 4-6, intenso 7-9) son las de uso clínico
 * habitual; el 10 se reserva para el ancla "el peor dolor imaginable".
 */
const CARAS = ['😀', '🙂', '🙂', '😐', '😐', '😕', '🙁', '😖', '😣', '😫', '😭'] as const;

const VALORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Verde → ámbar → rojo. El color acompaña, no reemplaza al número. */
const COLOR_DOLOR = [
  '#16A34A', '#3F9F2E', '#69A317', '#93A50B', '#BCA200',
  '#D99400', '#E77E00', '#EE6400', '#F04A0E', '#EE2F22', '#DC2626',
] as const;

function rotulo(v: number): string {
  if (v === 0) return 'Sin dolor';
  if (v <= 3) return 'Dolor leve';
  if (v <= 6) return 'Dolor moderado';
  if (v <= 9) return 'Dolor intenso';
  return 'El peor dolor que puedas imaginar';
}

export function CarasDolor({
  valor,
  onChange,
}: {
  valor: number | null;
  onChange: (n: number) => void;
}) {
  const elegido = valor !== null;
  const color = elegido ? COLOR_DOLOR[valor] : C.borde;

  return (
    <View style={s.eva}>
      {/* La cara grande: es el resumen de lo que la persona acaba de elegir. */}
      <View style={[s.evaCara, elegido && { borderColor: color }]}>
        <Text style={s.evaEmoji}>{elegido ? CARAS[valor] : '🤔'}</Text>
        <View style={s.evaLectura}>
          <Text style={[s.evaNumero, elegido && { color }]}>{elegido ? valor : '—'}</Text>
          <Text style={s.evaDe}>de 10</Text>
        </View>
      </View>

      <Text style={[s.evaRotulo, elegido && { color }]}>
        {elegido ? rotulo(valor) : 'Toca el número que representa tu dolor'}
      </Text>

      {/*
       * Los once números. Envuelven en dos filas en pantallas angostas en vez
       * de encogerse: once objetivos de 30 px son intocables para una mano con
       * secuela motora, que es exactamente la mano de nuestro usuario.
       */}
      <View style={s.evaFila}>
        {VALORES.map((v) => {
          const activo = valor === v;
          return (
            <View
              key={v}
              style={[
                s.evaBoton,
                activo && { backgroundColor: COLOR_DOLOR[v], borderColor: COLOR_DOLOR[v] },
              ]}
            >
              <Pressable
                onPress={() => onChange(v)}
                android_ripple={{ color: 'rgba(30,144,255,0.15)', borderless: false }}
                style={s.evaBotonZona}
                accessibilityRole="radio"
                accessibilityState={{ selected: activo }}
                accessibilityLabel={`${v} de 10, ${rotulo(v).toLowerCase()}`}
              >
                <Text style={[s.evaBotonTexto, activo && s.evaBotonTextoActivo]}>{v}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={s.evaExtremos}>
        <Text style={s.evaExtremo}>0 · sin dolor</Text>
        <Text style={s.evaExtremo}>10 · el peor</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Selector del lado con secuela.
 *
 * El sistema medía siempre el lado derecho, fijo en el código. En una
 * hemiparesia eso acierta la mitad de las veces: el resto del tiempo estaba
 * midiendo, felicitando y triando el brazo sano.
 */
export function SelectorLado({
  valor,
  onChange,
  compacto = false,
}: {
  valor: 'izquierdo' | 'derecho' | null;
  onChange: (l: 'izquierdo' | 'derecho') => void;
  compacto?: boolean;
}) {
  return (
    <View style={s.lados}>
      {(['izquierdo', 'derecho'] as const).map((l) => {
        const activo = valor === l;
        return (
          <View key={l} style={[s.lado, activo && s.ladoActivo, compacto && s.ladoCompacto]}>
            <Pressable
              onPress={() => onChange(l)}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
              style={s.ladoZona}
              accessibilityRole="radio"
              accessibilityState={{ selected: activo }}
            >
              <Text style={[s.ladoTexto, activo && s.ladoTextoActivo]}>
                {l === 'izquierdo' ? 'Izquierdo' : 'Derecho'}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tamizaje de signos de derivación inmediata.
 *
 * El prompt del agente siempre dijo "deriva si la persona refiere debilidad
 * nueva, dificultad para hablar…", pero nada se los preguntaba: dependía de que
 * la persona los escribiera por su cuenta en un campo de texto libre. Una regla
 * de derivación que necesita que el paciente adivine qué contar no es una regla
 * de derivación.
 *
 * Se pregunta uno por uno, en lenguaje de persona, no de manual.
 */
export const SIGNOS = [
  { clave: 'debilidad_nueva', texto: 'Sentiste el brazo, la pierna o la cara con menos fuerza que antes' },
  { clave: 'dificultad_hablar', texto: 'Te costó hablar o entender lo que te decían' },
  { clave: 'perdida_vision', texto: 'Perdiste la visión de golpe, aunque haya sido un momento' },
  { clave: 'cefalea_subita', texto: 'Te dio un dolor de cabeza fuerte y de repente' },
  { clave: 'dolor_pecho', texto: 'Sentiste dolor en el pecho' },
  { clave: 'perdida_conciencia', texto: 'Te desmayaste o perdiste el conocimiento' },
  { clave: 'caida_golpe_cabeza', texto: 'Te caíste y te golpeaste la cabeza' },
] as const;

export type ClaveSigno = (typeof SIGNOS)[number]['clave'];

/**
 * Tamizaje hablado, una pregunta a la vez.
 *
 * Antes era una lista de siete casillas para leer y marcar. Paulina lo miró y
 * dijo lo obvio: nuestro usuario es una persona mayor recién salida de un ACV,
 * a veces con afasia o con la visión comprometida, y le estábamos pidiendo que
 * leyera siete frases clínicas y decidiera cuáles aplicaban. Quien no lee bien
 * no marca nada, y "no marcó nada" se registra idéntico a "no le pasó nada".
 * Un tamizaje de seguridad que falla en silencio es peor que no tenerlo,
 * porque además da confianza.
 *
 * Ahora se pregunta como preguntaría una persona: una a la vez, en voz alta,
 * con dos botones grandes. Se responde sin leer nada.
 */
export function TamizajeSignos({
  marcados,
  onResponder,
  onCompleto,
}: {
  marcados: ClaveSigno[];
  onResponder: (c: ClaveSigno, si: boolean) => void;
  onCompleto?: () => void;
}) {
  const [indice, setIndice] = useState(0);
  const [empezado, setEmpezado] = useState(false);
  const listo = indice >= SIGNOS.length;
  const actual = SIGNOS[indice];

  // Cada pregunta se dice al aparecer. `decirPregunta` interrumpe la anterior:
  // si alguien avanza rápido, no queremos dos voces encimadas.
  useEffect(() => {
    if (!empezado || !actual) return;
    decirPregunta(actual.texto);
  }, [empezado, actual]);

  useEffect(() => {
    if (!empezado || !listo) return;
    hablar(
      marcados.length > 0
        ? 'Gracias. Le vamos a avisar a tu kinesiólogo.'
        : 'Listo, ninguna de esas cosas te pasó. Gracias.',
      { interrumpe: true, minMs: 0 },
    );
    onCompleto?.();
    // onCompleto no va en las dependencias a propósito: si el padre lo redefine
    // en cada render, esto se dispararía en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empezado, listo, marcados.length]);

  if (!empezado) {
    return (
      <View style={s.tamiCaja}>
        <Text style={s.tamiIntro}>
          Antes de terminar, {SIGNOS.length} preguntas cortas. Te las voy a leer.
        </Text>
        <View style={s.tamiBotonGrande}>
          <Pressable
            onPress={() => {
              hablar('Te voy a hacer unas preguntas. Responde sí o no.', {
                interrumpe: true,
                minMs: 0,
              });
              setEmpezado(true);
            }}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            style={s.tamiBotonZona}
            accessibilityRole="button"
          >
            <Text style={s.tamiBotonTexto}>Empezar las preguntas</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (listo) {
    return (
      <View style={[s.tamiCaja, marcados.length > 0 && s.tamiCajaAlerta]}>
        <Text style={[s.tamiResumen, marcados.length > 0 && s.tamiResumenAlerta]}>
          {marcados.length === 0
            ? 'Respondiste que no a todas. '
            : `Marcaste ${marcados.length} ${marcados.length === 1 ? 'cosa' : 'cosas'}. `}
        </Text>
        <Pressable
          onPress={() => setIndice(0)}
          style={s.tamiRepetirZona}
          accessibilityRole="button"
        >
          <Text style={s.tamiRepetir}>Volver a responderlas</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.tamiCaja}>
      <Text style={s.tamiPaso}>
        Pregunta {indice + 1} de {SIGNOS.length}
      </Text>

      <Text style={s.tamiPregunta}>{actual.texto}</Text>

      <Pressable
        onPress={() => decirPregunta(actual.texto)}
        style={s.tamiRepetirZona}
        accessibilityRole="button"
        accessibilityLabel="Escuchar la pregunta de nuevo"
      >
        <Text style={s.tamiRepetir}>🔊 Escuchar de nuevo</Text>
      </Pressable>

      <View style={s.tamiRespuestas}>
        <View style={[s.tamiRespuesta, s.tamiNo]}>
          <Pressable
            onPress={() => {
              onResponder(actual.clave, false);
              setIndice((i) => i + 1);
            }}
            android_ripple={{ color: 'rgba(27,42,107,0.12)' }}
            style={s.tamiRespuestaZona}
            accessibilityRole="button"
            accessibilityLabel={`No. ${actual.texto}`}
          >
            <Text style={s.tamiNoTexto}>No</Text>
          </Pressable>
        </View>

        <View style={[s.tamiRespuesta, s.tamiSi]}>
          <Pressable
            onPress={() => {
              onResponder(actual.clave, true);
              setIndice((i) => i + 1);
            }}
            android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
            style={s.tamiRespuestaZona}
            accessibilityRole="button"
            accessibilityLabel={`Sí. ${actual.texto}`}
          >
            <Text style={s.tamiSiTexto}>Sí</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  eva: { gap: 12 },
  evaCara: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18,
    borderRadius: R, borderWidth: 2.5, borderColor: C.borde,
    backgroundColor: C.hielo, paddingVertical: 14,
  },
  evaEmoji: { fontSize: 56 },
  evaLectura: { alignItems: 'center' },
  evaNumero: { fontSize: 46, fontWeight: '800', color: C.textoSuave, lineHeight: 50 },
  evaDe: { fontSize: 13, fontWeight: '600', color: C.textoSuave, marginTop: -2 },
  evaRotulo: { fontSize: 17, fontWeight: '800', color: C.textoSuave, textAlign: 'center' },

  evaFila: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  evaBoton: {
    width: 52, borderRadius: 14, borderWidth: 2, borderColor: C.borde,
    backgroundColor: C.blanco, overflow: 'hidden',
  },
  evaBotonZona: { height: 52, alignItems: 'center', justifyContent: 'center' },
  evaBotonTexto: { fontSize: 20, fontWeight: '800', color: C.marino },
  evaBotonTextoActivo: { color: C.blanco },

  evaExtremos: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  evaExtremo: { fontSize: 12.5, fontWeight: '600', color: C.textoSuave },

  lados: { flexDirection: 'row', gap: 10 },
  lado: {
    flex: 1, borderRadius: R, borderWidth: 2, borderColor: C.borde,
    backgroundColor: C.hielo, overflow: 'hidden',
  },
  ladoCompacto: { borderRadius: 12 },
  ladoActivo: { borderColor: C.electrico, backgroundColor: C.electrico },
  ladoZona: { paddingVertical: 14, alignItems: 'center' },
  ladoTexto: { fontSize: 16, fontWeight: '700', color: C.marino },
  ladoTextoActivo: { color: C.blanco },

  tamiCaja: {
    borderRadius: R, borderWidth: 2, borderColor: C.borde,
    backgroundColor: C.hielo, padding: 20, gap: 14, alignItems: 'center',
  },
  tamiCajaAlerta: { borderColor: C.rojo, backgroundColor: '#FEF2F2' },
  tamiIntro: { fontSize: 17, color: C.texto, textAlign: 'center', lineHeight: 24 },
  tamiPaso: {
    fontSize: 12.5, fontWeight: '800', color: C.electrico,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  // Grande de verdad: esta frase es lo único que la persona tiene que entender
  // en esta pantalla, y muchas veces la va a estar escuchando más que leyendo.
  tamiPregunta: {
    fontSize: 22, fontWeight: '700', color: C.marino,
    textAlign: 'center', lineHeight: 30,
  },
  tamiRepetirZona: { paddingVertical: 6, paddingHorizontal: 10 },
  tamiRepetir: { fontSize: 15, fontWeight: '700', color: C.electrico },
  tamiRespuestas: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  tamiRespuesta: { flex: 1, borderRadius: R, overflow: 'hidden', borderWidth: 2 },
  tamiRespuestaZona: { paddingVertical: 20, alignItems: 'center' },
  tamiNo: { borderColor: C.borde, backgroundColor: C.blanco },
  tamiNoTexto: { fontSize: 22, fontWeight: '800', color: C.marino },
  tamiSi: { borderColor: C.rojo, backgroundColor: C.rojo },
  tamiSiTexto: { fontSize: 22, fontWeight: '800', color: C.blanco },
  tamiBotonGrande: {
    alignSelf: 'stretch', borderRadius: R, overflow: 'hidden', backgroundColor: C.electrico,
  },
  tamiBotonZona: { paddingVertical: 18, alignItems: 'center' },
  tamiBotonTexto: { fontSize: 18, fontWeight: '800', color: C.blanco },
  tamiResumen: { fontSize: 17, color: C.texto, textAlign: 'center', lineHeight: 24 },
  tamiResumenAlerta: { color: C.rojo, fontWeight: '700' },

  signoTexto: { flex: 1, fontSize: 15.5, color: C.texto, lineHeight: 21 },
  signoTextoActivo: { color: C.rojo, fontWeight: '600' },
});
