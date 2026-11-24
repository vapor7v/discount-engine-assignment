import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import handleRequest from './api/parse-rule.js'

function apiMiddleware() {
  return {
    name: 'api-middleware',
    configureServer(server) {
      server.middlewares.use('/api/parse-rule', (req, res) => {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
          req.body = body
          try {
            await handleRequest(req, res)
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ status: 'error', message: e && e.message ? e.message : 'Server error' }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)
  return {
    plugins: [react(), apiMiddleware()],
  }
})
