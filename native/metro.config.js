const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "..")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.disableHierarchicalLookup = true;
config.resolver.sourceExts.push("mjs");
if (process.env.EXPO_TV === '1') config.resolver.sourceExts = ['tv.tsx','tv.ts','tv.js',...config.resolver.sourceExts];
module.exports = config;
