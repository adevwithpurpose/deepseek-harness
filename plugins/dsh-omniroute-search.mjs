/**
 * Permanent OmniRoute + DDGS WebSearchProvider for DeepSeek Harness.
 *
 * Mounted by the `web` profile via cordis.patch.yml:
 *   - insert:
 *       - id: omniroute-search
 *         name: 'file:///C:/Users/saf08/.dsh/plugins/dsh-omniroute-search.mjs'
 *
 * Primary: POST http://127.0.0.1:20128/v1/search (OmniRoute / Exa)
 * Fallback: Python DuckDuckGo (ddgs) CLI/library when the local gateway is unreachable
 */

export const name = 'omniroute-search'
export const inject = ['web', 'shell']

const GATEWAY_URL = 'http://127.0.0.1:20128/v1/search'
const REQUEST_TIMEOUT_MS = 45_000

export function apply(ctx) {
  const web = ctx.web
  const shell = ctx.shell
  const policyService = ctx.get('sandboxPolicy')

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

  // Fallback search via DuckDuckGo (ddgs)
  function searchDuckDuckGo(request, signal, primaryError) {
    console.warn(`[omniroute-search] Primary gateway failed (${primaryError.message}), falling back to DuckDuckGo (ddgs)...`)
    const count = typeof request.maxResults === 'number' && request.maxResults > 0 ? request.maxResults : 5
    const qEscaped = String(request.query || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const pyScript = `import sys, json; from ddgs import DDGS; q=sys.argv[1]; c=int(sys.argv[2]) if len(sys.argv)>2 else 5; print(json.dumps([{'url': r.get('href'), 'title': r.get('title'), 'snippet': r.get('body')} for r in DDGS().text(q, max_results=c)]))`

    const spec = shell.resolve({
      command: `python.exe -c "${pyScript}" "${qEscaped}" ${count}`,
      timeoutMs: 30_000,
      signal,
      sandboxPolicy: resolvePolicy(),
    })

    return shell.run(spec).then(function (run) {
      if (run.exitCode !== 0) {
        const errText = run.stderr && typeof run.stderr.text === 'string' ? run.stderr.text : ''
        throw new Error(`Both OmniRoute and DDGS fallback failed. OmniRoute: ${primaryError.message}; DDGS: ${errText.slice(0, 300)}`)
      }
      let rows = []
      try {
        // Look for the JSON line in stdout (in case python printed warnings)
        const lines = (run.stdout.text || '').trim().split('\n')
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim()
          if (line.startsWith('[') && line.endsWith(']')) {
            rows = JSON.parse(line)
            break
          }
        }
      } catch (err) {
        throw new Error(`Failed to parse DDGS JSON output: ${err.message}`)
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
    // time and mask the real "Both failed" error).
    let ddgsDone = false
    const runDdgs = function (primaryError) {
      ddgsDone = true
      return searchDuckDuckGo(request, signal, primaryError)
    }
    const body = { query: String(request.query || '') }
    if (typeof request.maxResults === 'number' && request.maxResults > 0) {
      body.count = request.maxResults
    }

    const payload = JSON.stringify(body).replace(/'/g, "''")
    const spec = shell.resolve({
      command:
        'curl.exe -s -X POST ' + GATEWAY_URL +
        ' -H "Content-Type: application/json"' +
        " --data-binary '" + payload + "' --max-time 30",
      timeoutMs: REQUEST_TIMEOUT_MS,
      signal,
      sandboxPolicy: resolvePolicy(),
    })

    return shell.run(spec).then(function (run) {
      if (run.exitCode !== 0) {
        const errText = run.stderr && typeof run.stderr.text === 'string' ? run.stderr.text : ''
        return runDdgs(new Error(`curl exit ${run.exitCode}: ${errText.slice(0, 200)}`))
      }
      let data
      try {
        data = JSON.parse(run.stdout.text)
      } catch (err) {
        return runDdgs(new Error('non-JSON response from OmniRoute gateway'))
      }

      const rows = Array.isArray(data.results) ? data.results : []
      if (rows.length === 0 && data.errors && data.errors.length > 0) {
        return runDdgs(new Error(`OmniRoute error: ${data.errors[0]}`))
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
  console.log('[omniroute-search] provider registered with DDGS cascade fallback -> ' + GATEWAY_URL)
}
