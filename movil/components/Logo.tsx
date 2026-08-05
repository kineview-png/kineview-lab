import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Canvas, Group, LinearGradient, Path, RoundedRect, Skia, vec,
} from '@shopify/react-native-skia';
import { C } from '../lib/theme';

/**
 * El logo de KineView, el mismo del sitio: un cerebro sobre un cuadrado con el
 * degradado de marca, y "Kine" en marino con "View" en azul eléctrico.
 *
 * Se dibuja con Skia y no con react-native-svg por una razón práctica: Skia ya
 * está compilado dentro de este APK, y agregar otro módulo nativo obligaría a
 * un build nuevo de 15 minutos por un logo.
 *
 * Los dos paths son los hemisferios, en un viewBox de 24×24 que se escala al
 * tamaño pedido.
 */
const HEMISFERIO_IZQ =
  'M9 4.5a2.6 2.6 0 0 0-2.6 2.6A2.4 2.4 0 0 0 4.6 9.5a2.5 2.5 0 0 0 .9 1.9A2.5 2.5 0 0 0 4.9 14a2.5 2.5 0 0 0 2.1 2.4A2.4 2.4 0 0 0 9.4 19a2.4 2.4 0 0 0 2.1-1.2V5.9A2.5 2.5 0 0 0 9 4.5Z';
const HEMISFERIO_DER =
  'M15 4.5a2.6 2.6 0 0 1 2.6 2.6 2.4 2.4 0 0 1 1.8 2.4 2.5 2.5 0 0 1-.9 1.9 2.5 2.5 0 0 1 .6 2.6 2.5 2.5 0 0 1-2.1 2.4A2.4 2.4 0 0 1 14.6 19a2.4 2.4 0 0 1-2.1-1.2V5.9A2.5 2.5 0 0 1 15 4.5Z';

const izq = Skia.Path.MakeFromSVGString(HEMISFERIO_IZQ);
const der = Skia.Path.MakeFromSVGString(HEMISFERIO_DER);

function Marca({ tamano = 38 }: { tamano?: number }) {
  const escala = (tamano * 0.56) / 24;
  const margen = (tamano - 24 * escala) / 2;

  return (
    <Canvas style={{ width: tamano, height: tamano }}>
      <RoundedRect x={0} y={0} width={tamano} height={tamano} r={tamano * 0.29}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(tamano, tamano)}
          colors={[C.marino, C.electrico, C.cyan]}
        />
      </RoundedRect>
      <Group transform={[{ translateX: margen }, { translateY: margen }, { scale: escala }]}>
        {izq && <Path path={izq} style="stroke" strokeWidth={1.8} strokeCap="round" strokeJoin="round" color={C.blanco} />}
        {der && <Path path={der} style="stroke" strokeWidth={1.8} strokeCap="round" strokeJoin="round" color={C.blanco} />}
      </Group>
    </Canvas>
  );
}

/**
 * Si Skia falla en algún dispositivo, el logo cae a un cuadrado sólido con la
 * inicial. Un logo feo es un detalle; una pantalla en blanco a mitad de la
 * demo, no.
 */
class ConRespaldo extends Component<{ tamano: number; children: ReactNode }, { roto: boolean }> {
  state = { roto: false };
  static getDerivedStateFromError() {
    return { roto: true };
  }
  render() {
    if (this.state.roto) {
      const t = this.props.tamano;
      return (
        <View style={[l.respaldo, { width: t, height: t, borderRadius: t * 0.29 }]}>
          <Text style={[l.respaldoTexto, { fontSize: t * 0.5 }]}>K</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export function Logo({ tamano = 38 }: { tamano?: number }) {
  return (
    <View style={l.fila}>
      <ConRespaldo tamano={tamano}>
        <Marca tamano={tamano} />
      </ConRespaldo>
      <Text style={l.texto}>
        Kine<Text style={l.acento}>View</Text>
      </Text>
    </View>
  );
}

const l = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  texto: { fontSize: 22, fontWeight: '800', color: C.marino, letterSpacing: -0.4 },
  acento: { color: C.electrico },
  respaldo: { backgroundColor: C.electrico, alignItems: 'center', justifyContent: 'center' },
  respaldoTexto: { color: C.blanco, fontWeight: '800' },
});
