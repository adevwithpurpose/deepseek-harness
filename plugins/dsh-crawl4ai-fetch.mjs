import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'crawl4ai-fetch'
export const inject = ['web', 'shell']

const REQUEST_TIMEOUT_MS = 60_000
const PY_SCRIPT_NAME = 'crawl4ai_fetch.py'

/**
 * crawl4ai fetch provider for DSH (v3: Linux/Windows/macOS portable).
 *
 * Registers a fetchProvider named `crawl4ai` that renders JS-heavy pages via
 * the companion script `crawl4ai_fetch.py` (Playwright + crawl4ai) instead of
 * the default pure-HTTP fetcher. Pin it in cordis.patch.yml:
 *   - id: web
 *     config:
 *       fetchProvider: crawl4ai
 *
 * v3 port: the script lives beside the plugin (DSH_CRAWL_SCRIPT overrides its
 * location) and the interpreter comes from DSH_PYTHON or the platform default
 * (python3 / python.exe) — no more hardcoded absolute paths.
 *
 * Prereq on the target machine: the crawl4ai Python package in the env used by
 * DSH_PYTHON (pip install crawl4ai && playwright install chromium).
 */

function resolvePluginHome() {
  return dirname(fileURLToPath(import.meta.url))
}

function resolvePython(env) {
  const override = env && env.DSH_PYTHON
  if (override && String(override).trim()) return String(override).trim()
  return process.platform === 'win32' ? 'python.exe' : 'python3'
}

function resolveScript(env) {
  const override = env && env.DSH_CRAWL_SCRIPT
  if (override && String(override).trim()) return String(override).trim()
  return join(resolvePluginHome(), PY_SCRIPT_NAME)
}

export function apply(ctx) {
  const shell = ctx.shell
  const policyService = ctx.get('sandboxPolicy')

  const scriptPath = resolveScript(process.env)
  if (!existsSync(scriptPath)) {
    throw new Error(
      '[crawl4ai-fetch] companion script missing: ' + scriptPath
      + ' (set DSH_CRAWL_SCRIPT to point at crawl4ai_fetch.py)'
    )
  }

  function resolvePolicy() {
    try {
      if (policyService && typeof policyService.resolve === 'function') {
        return policyService.resolve({})
      }
    } catch (err) {
      console.error('[crawl4ai-fetch] sandboxPolicy.resolve failed:', err)
    }
    return undefined
  }

  async function fetchUrl(url, options, signal) {
    // url is validated as an http(s) absolute URL by the web tool.
    const python = resolvePython(process.env)
    const spec = shell.resolve({
      command: `"${python}" "${scriptPath}" "${url}"`,
      timeoutMs: REQUEST_TIMEOUT_MS,
      signal,
      sandboxPolicy: resolvePolicy(),
    })
    const run = await shell.run(spec)
    if (run.exitCode !== 0) {
      const msg = run.stderr && typeof run.stderr.text === 'string'
        ? run.stderr.text.slice(0, 500)
        : 'exit ' + run.exitCode
      throw new Error('crawl4ai fetch failed: ' + msg)
    }
    const stdout = run.stdout && typeof run.stdout.text === 'string' ? run.stdout.text : ''
    const content = (stdout || '').trim()
    if (!content) {
      throw new Error('crawl4ai fetch returned empty content for ' + url)
    }
    const headers = {
      'content-type': 'text/html; charset=utf-8',
    }
    return { status: 200, headers, body: { kind: 'html', content } }
  }

  ctx.web.registerFetchProvider({
    name: 'crawl4ai',
    label: 'crawl4ai (JS-rendered)',
    fetcher: fetchUrl,
  })

  console.log('[crawl4ai-fetch] fetchProvider "crawl4ai" registered')
}
