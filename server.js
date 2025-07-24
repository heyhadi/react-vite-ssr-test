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

// Add request logging for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl} - ${new Date().toISOString()}`)
  next()
})

// Required middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

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

  // Custom error handling middleware for development
  app.use(async (req, res, next) => {
    try {
      next()
    } catch (error) {
      console.error('Development error:', error)
      const statusCode = error.status || 500
      const html = await vite.transformIndexHtml(
        req.url,
        `<h1>${statusCode} Error</h1><pre>${error.stack}</pre>`
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// API Routes - Define these BEFORE the catch-all route
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working!', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// Login endpoint with improved error handling
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body
  console.log('Login attempt for:', username)

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: 'Username and password are required' })
  }

  const authusername = process.env.AUTH_USERNAME || ''
  const authpassword = process.env.AUTH_PASSWORD || ''

  if (!authusername || !authpassword) {
    console.error('Missing AUTH_USERNAME or AUTH_PASSWORD environment variables')
    return res
      .status(500)
      .json({ message: 'Server configuration error' })
  }

  try {
    // Prepare Basic Auth header
    const basicAuthToken = Buffer.from(
      `${authusername}:${authpassword}`
    ).toString('base64')

    console.log('Making request to external API...')

    // Forward request to your backend API with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const response = await fetch(
      'https://tlk8q0zuk9.execute-api.ap-southeast-1.amazonaws.com/api/cmsuser/v1/auth/login',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuthToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          email: username,
          password,
        }),
        signal: controller.signal
      }
    )

    clearTimeout(timeoutId)

    console.log('External API response status:', response.status)
    console.log('External API response headers:', Object.fromEntries(response.headers.entries()))

    // Check if response is actually JSON
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const textResponse = await response.text()
      console.error('Non-JSON response from external API:', textResponse.substring(0, 500))
      return res.status(502).json({ 
        message: 'Invalid response from authentication server',
        details: 'Expected JSON but received HTML or other content type'
      })
    }

    let data
    try {
      data = await response.json()
    } catch (jsonError) {
      console.error('Failed to parse JSON response:', jsonError)
      return res.status(502).json({ 
        message: 'Invalid JSON response from authentication server'
      })
    }

    console.log('Login response data:', { ...data, token: data.token ? '[REDACTED]' : undefined })

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ message: data.message || 'Login failed' })
    }

    // Optional: set token in HTTP-only cookie if you get a token
    if (data.token) {
      res.cookie('token', data.token, {
        httpOnly: true,
        secure: isProduction, // Use secure cookies in production
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      })
    }

    return res.json({ success: true, data: { ...data, token: undefined } }) // Don't send token in response body
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('Login request timeout')
      return res.status(504).json({ message: 'Request timeout' })
    }
    
    console.error('Login error:', err)
    return res.status(500).json({ 
      message: 'Internal server error',
      details: isProduction ? undefined : err.message
    })
  }
})

// Catch 404 for API routes that don't exist
app.use('/api/*path', (req, res) => {
  res.status(404).json({ 
    message: 'API endpoint not found',
    path: req.originalUrl
  })
})

// SSR Handler - This should be the LAST route handler
app.get('*all', async (req, res) => {
  // Skip API routes - they should have been handled above
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ message: 'API endpoint not found' })
  }

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
    if (vite) {
      vite.ssrFixStacktrace(e)
    }
    console.error('SSR Error:', e)
    
    // Send a proper error response
    if (!res.headersSent) {
      res.status(500).set({ 'Content-Type': 'text/html' }).send(
        isProduction 
          ? '<h1>500 - Internal Server Error</h1>' 
          : `<h1>500 - Internal Server Error</h1><pre>${e.stack}</pre>`
      )
    }
  }
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  if (!res.headersSent) {
    res.status(500).json({ 
      message: 'Internal server error',
      details: isProduction ? undefined : err.message
    })
  }
})

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully')
  process.exit(0)
})

// Start http server
app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`Base path: ${base}`)
})

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})