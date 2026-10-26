import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
export default defineConfig({base:'./', plugins:[react(),legacy({targets:['Chrome >= 69','Safari >= 12'],modernPolyfills:true})],server:{port:4173,proxy:{'/api':'http://127.0.0.1:4174','/socket':{target:'ws://127.0.0.1:4174',ws:true}}},build:{target:'es2015'}});
