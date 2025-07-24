import fs from 'node:fs/promises' // NodeJS async file system module, 'interact' static files
import express from 'express' // Express is NodeJS library for building api
import 'dotenv/config'; 

/**
  This file is used to set up a NodeJS Express server to handle SSR for our React application. It dynamically selects the appropriate SSR render function and template based on the environment (development or production) and serves the rendered HTML to clients upon request.

  The server is set up to serve the client-side assets in production and use Vite's middleware in development. The server also reads the SSR manifest file in production to determine the appropriate render function to use.
 */

// Constants
const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 5173
const base = process.env.BASE || '/'

// Cached production assets
const templateHtml = isProduction
  ? await fs.readFile('./dist/client/index.html', 'utf-8')
  : ''
const ssrManifest = isProduction
  ? await fs.readFile('./dist/client/.vite/ssr-manifest.json', 'utf-8')
  : undefined

// Create http server
const app = express()


// Required middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Add Vite or respective production middlewares
let vite
if (!isProduction) {
  const { createServer } = await import('vite')
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    base,
  })
  app.use(vite.middlewares)

  app.use(async (req, res, next) => {
    try {
      // Custom middleware logic
      next()
    } catch (error) {
      const statusCode = error.status || 500
      const html = await vite.transformIndexHtml(
        req.url,
        `<h1>${statusCode} Error</h1>`
      )
      res.status(statusCode).set({ 'Content-Type': 'text/html' }).end(html)
    }
  })
} else {
  const compression = (await import('compression')).default
  const sirv = (await import('sirv')).default
  app.use(compression())
  app.use(base, sirv('./dist/client', { extensions: [] }))
}

// Example API route (testable from Postman or browser)
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' })
})


// Example /api/login route
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body
  console.log(req.body)

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: 'Username and password are required' })
  }
  console.log(process.env.AUTH_USERNAME);

  const authusername = process.env.AUTH_USERNAME || ''
  const authpassword = process.env.AUTH_PASSWORD || ''

  try {
    // Prepare Basic Auth header
    const basicAuthToken = Buffer.from(
      `${authusername}:${authpassword}`
    ).toString('base64')

    // Forward request to your backend API
    const response = await fetch(
      'https://tlk8q0zuk9.execute-api.ap-southeast-1.amazonaws.com/api/cmsuser/v1/auth/login',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuthToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: username,
          password,
        }),
      }
    )

    const data = await response.json()
    console.log('Login response:', response)

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ message: data.message || 'Login failed' })
    }

    // Optional: set token in HTTP-only cookie if you get a token
    if (data.token) {
      res.cookie('token', data.token, {
        httpOnly: true,
        secure: false, // true if https
        sameSite: 'strict',
      })
    }

    return res.json({ success: true, data })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Internal server error' })
  }
})

// Serve HTML
app.use('*all', async (req, res) => {
  try {
    const url = req.originalUrl.replace(base, '')

    let template
    let render
    if (!isProduction) {
      // Always read fresh template in development
      template = await fs.readFile('./index.html', 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      render = (await vite.ssrLoadModule('/src/entry-server.tsx')).render
    } else {
      template = templateHtml
      render = (await import('./dist/server/entry-server.js')).render
    }

    const rendered = await render(url, ssrManifest)

    const html = template
      .replace(`<!--app-head-->`, rendered.head ?? '')
      .replace(`<!--app-html-->`, rendered.html ?? '')

    res.status(200).set({ 'Content-Type': 'text/html' }).send(html)
  } catch (e) {
    vite?.ssrFixStacktrace(e)
    console.log(e.stack)
    res.status(500).end(e.stack)
  }
})

// Start http server
app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`)
})
