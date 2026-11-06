import { defineConfig, type Plugin } from 'vite'

/** API local del editor: biblioteca en disco, subidas y procesamiento (ver server/api.ts). */
function gojaguarApi(): Plugin {
  return {
    name: 'gojaguar-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res, next) => {
        const mod = await server.ssrLoadModule('/server/api.ts')
        await (mod as typeof import('./server/api')).handle(req, res, next)
      })
    },
  }
}

export default defineConfig({
  server: { host: '127.0.0.1' },
  plugins: [gojaguarApi()],
})
