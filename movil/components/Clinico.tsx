import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, R } from '../lib/theme';

// ═══════════════════════════════════════════════════════════════════════════
// Piezas clínicas de la app del paciente.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Escala de dolor con caras, en vez de una fila de números del 0 al 10.
 *
 * Pedido de Paulina, y con razón: pedirle a una persona mayor —muchas veces
 * sola, a veces con afasia después de un ACV— que traduzca su dolor a un número
 * abstracto es pedirle un trabajo cognitivo que no tiene por qué hacer. Las
 * caras son el estándar clínico para eso (tipo Wong-Baker) y se responden de un
 * vistazo.
 *
 * Por dentro sigue siendo EVA 0-10: lo que cambia es cómo se pregunta, no lo
 * que se registra, así que el historial y los umbrales del agente siguen
 * comparables.
 */
const CARAS = [
  { valor: 0, cara: '😀', texto: 'Sin dolor' },
  { valor: 2, cara: '🙂', texto: 'Un poquito' },
  { valor: 4, cara: '😐', texto: 'Algo' },
  { valor: 6, cara: '🙁', texto: 'Bastante' },
  { valor: 8, cara: '😣', texto: 'Mucho' },
  { valor: 10, cara: '😫', texto: 'El peor' },
] as const;

export function CarasDolor({
  valor,
  onChange,
}: {
  valor: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <View style={s.caras}>
      {CARAS.map((c) => {
        const activa = valor === c.valor;
        return (
          <View key={c.valor} style={[s.cara, activa && s.caraActiva]}>
            <Pressable
              onPress={() => onChange(c.valor)}
              android_ripple={{ color: 'rgba(30,144,255,0.15)' }}
              style={s.caraZona}
              accessibilityRole="radio"
              accessibilityState={{ selected: activa }}
              accessibilityLabel={`${c.texto}, ${c.valor} de 10`}
            >
              <Text style={s.caraEmoji}>{c.cara}</Text>
              <Text style={[s.caraTexto, activa && s.caraTextoActivo]}>{c.texto}</Text>
            </Pressable>
          </View>
        );
      })}
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

export function TamizajeSignos({
  marcados,
  onToggle,
}: {
  marcados: ClaveSigno[];
  onToggle: (c: ClaveSigno) => void;
}) {
  return (
    <View style={s.signos}>
      {SIGNOS.map((sig) => {
        const activo = marcados.includes(sig.clave);
        return (
          <View key={sig.clave} style={[s.signo, activo && s.signoActivo]}>
            <Pressable
              onPress={() => onToggle(sig.clave)}
              android_ripple={{ color: 'rgba(220,38,38,0.12)' }}
              style={s.signoZona}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: activo }}
            >
              <View style={[s.casilla, activo && s.casillaActiva]}>
                {activo && <Text style={s.casillaMarca}>✓</Text>}
              </View>
              <Text style={[s.signoTexto, activo && s.signoTextoActivo]}>{sig.texto}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  caras: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cara: {
    width: '31%', borderRadius: R, borderWidth: 2, borderColor: C.borde,
    backgroundColor: C.hielo, overflow: 'hidden',
  },
  caraActiva: { borderColor: C.electrico, backgroundColor: C.blanco },
  caraZona: { alignItems: 'center', paddingVertical: 12, gap: 2 },
  caraEmoji: { fontSize: 34 },
  caraTexto: { fontSize: 12.5, color: C.textoSuave, fontWeight: '600', textAlign: 'center' },
  caraTextoActivo: { color: C.marino, fontWeight: '800' },

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

  signos: { gap: 8 },
  signo: {
    borderRadius: R, borderWidth: 1.5, borderColor: C.borde,
    backgroundColor: C.hielo, overflow: 'hidden',
  },
  signoActivo: { borderColor: C.rojo, backgroundColor: '#FEF2F2' },
  signoZona: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  casilla: {
    width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: C.borde,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.blanco,
  },
  casillaActiva: { borderColor: C.rojo, backgroundColor: C.rojo },
  casillaMarca: { color: C.blanco, fontSize: 16, fontWeight: '800' },
  signoTexto: { flex: 1, fontSize: 15.5, color: C.texto, lineHeight: 21 },
  signoTextoActivo: { color: C.rojo, fontWeight: '600' },
});
