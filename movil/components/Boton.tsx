import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { C, R } from '../lib/theme';

/**
 * ⚠️ Patrón deliberado, no una complicación gratuita.
 *
 * En el dev client de Expo SDK 53, un `Pressable` con `style={({pressed}) => …}`
 * pierde el `backgroundColor`: el botón se dibuja transparente y parece que la
 * app se rompió. Por eso el color vive en una `View` envolvente y el `Pressable`
 * va adentro, sin estilo de fondo, resolviendo el feedback táctil con
 * `android_ripple`.
 *
 * Todos los botones de la app pasan por acá para que ese bug no pueda volver
 * por la puerta de atrás.
 */
export function Boton({
  titulo,
  onPress,
  variante = 'primario',
  deshabilitado = false,
  estilo,
}: {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario' | 'peligro';
  deshabilitado?: boolean;
  estilo?: ViewStyle;
}) {
  const fondo =
    deshabilitado ? C.borde
    : variante === 'primario' ? C.electrico
    : variante === 'peligro' ? C.rojo
    : C.hielo;

  const colorTexto =
    deshabilitado ? C.textoSuave
    : variante === 'secundario' ? C.marino
    : C.blanco;

  return (
    <View style={[s.contenedor, { backgroundColor: fondo }, estilo]}>
      <Pressable
        onPress={deshabilitado ? undefined : onPress}
        android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
        style={s.zona}
      >
        <Text style={[s.texto, { color: colorTexto }]}>{titulo}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  contenedor: { borderRadius: R, overflow: 'hidden' },
  zona: { paddingVertical: 16, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  texto: { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
});
