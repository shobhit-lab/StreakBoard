import { defineConfig } from 'vite';

// Vite transforms .jsx with esbuild. "automatic" uses React's JSX runtime,
// so no Babel plugin is needed.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
});
