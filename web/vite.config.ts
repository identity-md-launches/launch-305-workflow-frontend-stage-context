import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'deployment-for-local-development',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0];
        if (path !== '/imd-deployment.json' && !/^\/abi\/[A-Za-z0-9_]+\.json$/.test(path || '')) return next();
        try {
          const content = await readFile(new URL(`../dist${path}`, import.meta.url));
          response.setHeader('Content-Type', 'application/json'); response.end(content);
        } catch { response.statusCode = 503; response.end('Run npm run build first to generate the deployment configuration.'); }
      });
    },
  }],
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: false },
});
