import {defineConfig} from 'vite';
import motionCanvas from '@revideo/vite-plugin';

// The scenes read the installer's packs.json and hooks/sprites/clawd.ts straight from the
// repo, so vite has to be allowed to serve files above demo/.
export const fsAllow = ['..', '../..'];

export default defineConfig({
  plugins: [motionCanvas({project: './src/project.ts'})],
  server: {fs: {allow: fsAllow}},
});
