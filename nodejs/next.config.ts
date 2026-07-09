import type { NextConfig } from 'next'
import fs from 'node:fs'
import path from 'node:path'

// Version source of truth: the repo-root VERSION file. Bump that file and
// every consumer follows — Next env (NEXT_PUBLIC_APP_VERSION), the package
// version bump script if you add one, badges, etc. Falls back to
// package.json's version field only if VERSION isn't accessible (which
// shouldn't happen in normal dev or docker builds since the Dockerfile
// explicitly copies VERSION into the builder stage).
function readVersion(): string {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf-8').trim()
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./package.json').version
  }
}
const version = readVersion()

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  env: { NEXT_PUBLIC_APP_VERSION: version },

  // Ship a self-destruct service worker on /sw.js so any browser that still
  // has the old next-pwa SW cached (from the mighty-ai-qr-web fork days)
  // unregisters itself + drops all caches on next page load. Pair with the
  // brief Cache-Control header below to make sure the new sw.js doesn't get
  // long-cached by the SW it's trying to evict. Once everyone you care about
  // has reloaded once, the headers + /sw.js route can be removed.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type',  value: 'application/javascript; charset=utf-8' },
        ],
      },
    ]
  },
}

export default nextConfig
