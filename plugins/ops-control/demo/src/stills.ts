import {makeProject} from '@revideo/core';
import regular from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import bold from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2?url';
import stills from './scenes/stills?scene';

for (const [url, weight] of [[regular, '400'], [bold, '700']]) {
  const face = new FontFace('JetBrains Mono', `url(${url})`, {weight});
  document.fonts.add(await face.load());
}

export default makeProject({
  scenes: [stills],
  settings: {
    shared: {size: {x: 2560, y: 1408}, background: '#1f1f24'},
    rendering: {fps: 30, exporter: {name: '@revideo/core/wasm'}},
  },
});
