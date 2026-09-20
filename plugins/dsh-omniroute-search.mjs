/**
 * Permanent OmniRoute + DDGS WebSearchProvider for DeepSeek Harness.
 *
 * Mounted by the 'web' profile via cordis.patch.yml (see cordis.patch.example.yml)
 * with a repo-relative name:
 *   - insert:
 *       - id: omniroute-search
 *         name: 'file:///<dsh-home>/plugins/dsh-omniroute-search.mjs'
 *
 * Primary: POST <gateway> (default http://127.0.0.1:20128/v1/search), fallback:
 * a 'python3 -c' DuckDuckGo (ddgs) one-liner when the gateway is unreachable.
 * Zero-import plugin: executables are resolved by the shell through PATH.
 * Configuration: environment variables, see README.md (dsh-plugin-setup.md).
 */
export const name = 'omniroute-search'
export const inject = ['web', 'shell']

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:20128/v1/search'
const REQUEST_TIMEOUT_MS = 45_000

function isWin32() {
  return process.platform === 'win32'
}

export function resolveOmniConfig(env) {
  const e = env || process.env
  const timeoutRaw = Number(e.DSH_OMNIROUTE_TIMEOUT_MS)
  const curl = e.DSH_CURL && String(e.DSH_CURL).trim() !== '' ? String(e.DSH_CURL).trim() : (isWin32() ? 'curl.exe' : 'curl')
  const python = e.DSH_PYTHON && String(e.DSH_PYTHON).trim() !== '' ? String(e.DSH_PYTHON).trim() : (isWin32() ? 'python.exe' : 'python3')
  return {
    gatewayUrl: e.DSH_OMNIROUTE_URL && String(e.DSH_OMNIROUTE_URL).trim() !== ''
      ? String(e.DSH_OMNIROUTE_URL).trim()
      : DEFAULT_GATEWAY_URL,
    curlExe: curl,
    pythonExe: python,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : REQUEST_TIMEOUT_MS,
  }
}

// POSIX single-quote escaping: a single quote inside a single-quoted string
// becomes two consecutive quotes.
export function escapeSingleQuotes(s) {
  return String(s).replace(/'/g, "''")
}

// Backslash/double-quote escaping for embedding inside a double-quoted argument.
export function escapeDoubleQuote(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// Static DDGS one-liner (uses the 'ddgs' package when installed).
export const DDGS_SCRIPT = "import sys, json; from ddgs import DDGS; q=sys.argv[1]; c=int(sys.argv[2]) if len(sys.argv)>2 else 5; print(json.dumps([{'url': r.get('href'), 'title': r.get('title'), 'snippet': r.get('body')} for r in DDGS().text(q, max_results=c)]))"

export function buildDdgsCommand(query, count, pythonExe) {
  const n = Number.isFinite(count) && count > 0 ? Math.max(1, Math.floor(count)) : 5
  return pythonExe + ' -c "' + DDGS_SCRIPT + '" "' + escapeDoubleQuote(query) + '" ' + n
}

// Picks the last JSON-array line out of a (possibly noisy) stdout stream.
export function parseLastJsonArray(text) {
  const lines = String(text || '').trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('[') && line.endsWith(']')) {
      try { return JSON.parse(line) } catch (err) { throw err }
    }
  }
  return null
}

export function apply(ctx) {
  const web = ctx.web
  const shell = ctx.shell
  const policyService = ctx.get('sandboxPolicy')
  const cfg = resolveOmniConfig()

  function resolvePolicy() {
    try {
      if (policyService && typeof policyService.resolve === 'function') {
        return policyService.resolve({})
      }
    } catch (err) {
      console.error('[omniroute-search] sandboxPolicy.resolve failed:', err)
    }
    return undefined
  }

  function searchDuckDuckGo(request, signal, primaryError) {
    console.warn('[omniroute-search] Primary gateway failed (' + (primaryError && primaryError.message) + '), falling back to DuckDuckGo (ddgs)...')
    const count = typeof request.maxResults === 'number' && request.maxResults > 0 ? request.maxResults : 5

    const spec = shell.resolve({
      command: buildDdgsCommand(String(request.query || ''), count, cfg.pythonExe),
      timeoutMs: 30_000,
      signal,
      sandboxPolicy: resolvePolicy(),
    })

    return shell.run(spec).then(function (run) {
      if (run.exitCode !== 0) {
        const errText = run.stderr && typeof run.stderr.text === 'string' ? run.stderr.text : ''
        throw new Error('Both OmniRoute and DDGS fallback failed. OmniRoute: ' + (primaryError ? primaryError.message : 'unknown') + '; DDGS: ' + errText.slice(0, 300))
      }
      let rows = []
      try {
        rows = parseLastJsonArray(run.stdout.text) || []
      } catch (err) {
        throw new Error('Failed to parse DDGS JSON output: ' + err.message)
      }

      const sources = []
      for (const row of rows) {
        if (!row || typeof row.url !== 'string' || row.url === '') continue
        sources.push({
          url: row.url,
          title: typeof row.title === 'string' ? row.title : undefined,
          snippet: typeof row.snippet === 'string' ? row.snippet : undefined,
        })
      }
      return { sources, truncated: false }
    })
  }

  function search(request, signal) {
    // Per-call guard: the outer .catch must not re-run DuckDuckGo after an
    // inner fallback has already been attempted (it would retry DDGS a second
    // time and mask the real 'Both failed' error).
    let ddgsDone = false
    const runDdgs = function (primaryError) {
      ddgsDone = true
      return searchDuckDuckGo(request, signal, primaryError)
    }
    const body = { query: String(request.query || '') }
    if (typeof request.maxResults === 'number' && request.maxResults > 0) {
      body.count = request.maxResults
    }

    const payload = escapeSingleQuotes(JSON.stringify(body))
    const spec = shell.resolve({
      command:
        cfg.curlExe + ' -s -X POST ' + cfg.gatewayUrl +
        ' -H "Content-Type: application/json"' +
        " --data-binary '" + payload + "' --max-time 30",
      timeoutMs: cfg.timeoutMs,
      signal,
      sandboxPolicy: resolvePolicy(),
    })

    return shell.run(spec).then(function (run) {
      if (run.exitCode !== 0) {
        const errText = run.stderr && typeof run.stderr.text === 'string' ? run.stderr.text : ''
        return runDdgs(new Error('curl exit ' + run.exitCode + ': ' + errText.slice(0, 200)))
      }
      let data
      try {
        data = JSON.parse(run.stdout.text)
      } catch (err) {
        return runDdgs(new Error('non-JSON response from OmniRoute gateway'))
      }

      const rows = Array.isArray(data.results) ? data.results : []
      if (rows.length === 0 && data.errors && data.errors.length > 0) {
        return runDdgs(new Error('OmniRoute error: ' + data.errors[0]))
      }

      const sources = []
      for (const row of rows) {
        if (!row || typeof row.url !== 'string' || row.url === '') continue
        const source = { url: row.url }
        if (typeof row.title === 'string' && row.title !== '') source.title = row.title
        if (typeof row.snippet === 'string' && row.snippet !== '') source.snippet = row.snippet
        if (typeof row.published_at === 'string' && row.published_at !== '') source.publishedAt = row.published_at
        sources.push(source)
      }
      const result = { sources, truncated: false }
      if (typeof data.answer === 'string' && data.answer !== '') result.content = data.answer
      return result
    }).catch(function (err) {
      if (ddgsDone) throw err
      return runDdgs(err)
    })
  }

  ctx.effect(function () {
    return web.registerSearchProvider({
      id: 'omniroute',
      available: function () { return true },
      search,
    })
  })
}
