const {withPodfile} = require('expo/config-plugins');
module.exports = config => {
  if (process.env.EXPO_TV !== '1') return config;
  return withPodfile(config, c => {
    // ExpoCamera targets iOS phones, not tvOS. Do not link it into the TV binary.
    c.modResults.contents = c.modResults.contents.replace(/^([ \t]*)use_expo_modules!\s*$/m, "$1use_expo_modules!({ exclude: ['expo-camera'] })");
    return c;
  });
};
