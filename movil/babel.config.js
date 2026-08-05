module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // ⚠️ EL ORDEN IMPORTA Y NO ES NEGOCIABLE.
      // El plugin de worklets-core va ANTES que el de reanimated. Al revés,
      // Metro arranca pero los frame processors de la cámara no reciben las
      // worklets compiladas y la detección de pose falla en silencio — que es
      // mucho peor que un error de compilación, porque parece un problema del
      // modelo.
      'react-native-worklets-core/plugin',
      'react-native-reanimated/plugin',
    ],
  };
};
