/// <reference types="vite/client" />

declare module '*?scene' {
  import type {SceneDescription} from '@revideo/core';
  const description: SceneDescription;
  export default description;
}
