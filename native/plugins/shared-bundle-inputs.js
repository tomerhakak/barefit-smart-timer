const {withAppBuildGradle} = require('expo/config-plugins');
const marker = '// BareFit shared bundle inputs';
const block = `
${marker}
tasks.configureEach { task ->
    if (task.name.startsWith('createBundle') && task.name.endsWith('JsAndAssets')) {
        task.inputs.dir(rootProject.file('../../shared'))
        task.inputs.dir(rootProject.file('../../public'))
    }
}
`;
module.exports = config => withAppBuildGradle(config, c => {
  if (!c.modResults.contents.includes(marker)) c.modResults.contents += block;
  return c;
});
module.exports.block = block;
module.exports.marker = marker;
