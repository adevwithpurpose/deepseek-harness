/**
 * Permanent Crawl4AI WebFetchProvider for DeepSeek Harness.
 *
 * Mounted by the `web` profile via cordis.patch.yml:
 *   - insert:
 *       - id: crawl4ai-fetch
 *         name: 'file:///C:/Users/saf08/.dsh/plugins/dsh-crawl4ai-fetch.mjs'
 *
 * Registers a `WebFetchProvider` with id `crawl4ai` into `ctx.web`.
 * Uses local Python Crawl4AI to execute JavaScript and extract clean Markdown.
 *
 * v2 fix (2026-08-22 self-audit): the Python program now lives in the companion
 * file `crawl4ai_fetch.py` beside this plugin and is invoked as a normal script
 * (`python.exe crawl4ai_fetch.py "<url>"`). The previous build inlined the
 * script through `python -c` after collapsing every newline into a space, which
 * produced invalid Python (SyntaxError) for every single request.
 */

export const name = 'crawl4ai-fetch'
export const inject = ['web', 'shell']

const REQUEST_TIMEOUT_MS = 60_000
const PY_SCRIPT_PATH = 'C:/Users/saf08/.dsh/plugins/crawl4ai_fetch.py'

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
      console.error('[crawl4ai-fetch] sandboxPolicy.resolve failed:', err)
    }
    return undefined
  }

  function fetchUrl(request, signal) {
    const targetUrl = String(request.url || '').trim()
    if (!targetUrl) {
      return Promise.reject(new Error('crawl4ai-fetch: empty URL provided'))
    }

    // Escape only what can break out of the double-quoted argument.
    const urlEscaped = targetUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

    const spec = shell.resolve({
      command: `python.exe "${PY_SCRIPT_PATH}" "${urlEscaped}"`,
      timeoutMs: REQUEST_TIMEOUT_MS,
      signal,
      sandboxPolicy: resolvePolicy(),
    })

    return shell.run(spec).then(function (run) {
      if (run.exitCode !== 0) {
        const errText = run.stderr && typeof run.stderr.text === 'string' ? run.stderr.text : ''
        throw new Error(`Crawl4AI execution failed (exit ${run.exitCode}): ${errText.slice(0, 300)}`)
      }

      let parsed = null
      const lines = (run.stdout.text || '').trim().split('\n')
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim()
        if (line.startsWith('{') && line.endsWith('}')) {
          try {
            parsed = JSON.parse(line)
            break
          } catch {}
        }
      }

      if (!parsed || !parsed.success) {
        const err = parsed && parsed.error ? parsed.error : 'Invalid response from crawler'
        throw new Error(`Crawl4AI error: ${err}`)
      }

      return {
        url: parsed.url || targetUrl,
        statusCode: parsed.statusCode || 200,
        body: {
          kind: 'text',
          content: parsed.content || '',
        },
        truncated: false,
      }
    })
  }

  ctx.effect(function () {
    return web.registerFetchProvider({
      id: 'crawl4ai',
      available: function () { return true },
      fetch: fetchUrl,
    })
  })
  console.log('[crawl4ai-fetch] provider registered -> id: crawl4ai')
}
