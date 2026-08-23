/**
 * Permanent YouTube transcript tool for DeepSeek Harness.
 *
 * Mounted by the `web` profile via cordis.patch.yml:
 *   - insert:
 *       - id: youtube-transcript
 *         name: 'file:///C:/Users/saf08/.dsh/plugins/dsh-youtube-transcript.mjs'
 *
 * Registers the model tool `youtube_transcript`: given any YouTube URL or
 * 11-char video ID it returns the FULL transcript text in one call, so agents
 * can summarize without loading the youtube-summarizer skill's multi-step
 * procedure. Extraction wraps the three-tier extractor from the vault skill
 * (public captions API -> authenticated yt-dlp with cookies -> faster-whisper).
 *
 * v2: results are cached per (videoId, language) for 30 minutes, so repeat
 * calls are instant instead of re-running Python; optional `offset`/`limit`
 * args page through long transcripts without re-extraction; `finalizeContent`
 * delivers the complete paged text to the model (the old build relied on the
 * UI-facing render, which clipped around 2k chars and forced agents to refetch
 * in slices).
 */

export const name = 'youtube-transcript'
export const inject = ['tools', 'shell', 'systemPrompt']

const EXTRACTOR = 'E:\\gem\\Agent Skills\\youtube-summarizer\\scripts\\extract-transcript.py'
const MAX_CHARS = 150000
const TIMEOUT_MS = 300000
const CACHE_TTL_MS = 30 * 60 * 1000

/** key `${videoId}|${lang}` -> { text, ts } */
const cache = new Map()

export function apply(ctx) {
  const shell = ctx.shell
  const policyService = ctx.get('sandboxPolicy')

  function resolvePolicy() {
    try {
      if (policyService && typeof policyService.resolve === 'function') {
        return policyService.resolve({})
      }
    } catch (err) {
      console.error('[youtube-transcript] sandboxPolicy.resolve failed:', err)
    }
    return undefined
  }

  function extractVideoId(input) {
    const s = String(input || '').trim()
    const m = s.match(/(?:v=|\/shorts\/|\/live\/|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    if (m) return m[1]
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
    return null
  }

  function cached(key) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.text
    if (hit) cache.delete(key)
    return null
  }

  async function extract(id, lang, signal) {
    // `id` is validated against [A-Za-z0-9_-]{11} and `lang` against
    // ^[a-zA-Z-]{2,10}$ by callers, so both are safe to interpolate unquoted.
    const spec = shell.resolve({
      command: `python.exe "${EXTRACTOR}" ${id} ${lang}`,
      timeoutMs: TIMEOUT_MS,
      signal,
      sandboxPolicy: resolvePolicy(),
    })
    const run = await shell.run(spec)
    if (run.exitCode !== 0) {
      const errText = run.stderr && typeof run.stderr.text === 'string' ? run.stderr.text : ''
      throw new Error(`youtube_transcript: extraction failed (exit ${run.exitCode}): ${errText.slice(0, 400)}`)
    }
    const text = (run.stdout.text || '').trim()
    if (!text) {
      const errText = run.stderr && typeof run.stderr.text === 'string' ? run.stderr.text : ''
      throw new Error(`youtube_transcript: no transcript output. stderr head: ${errText.slice(0, 300)}`)
    }
    cache.set(`${id}|${lang}`, { text, ts: Date.now() })
    return text
  }

  ctx.tools.register({
    name: 'youtube_transcript',
    description:
      'Fetch the transcript text for a YouTube video. Accepts any YouTube URL '
      + '(watch, youtu.be, shorts, live, embed) or a raw 11-character video ID. '
      + 'Returns the full transcript by default; results are cached for 30 minutes, '
      + 'and `offset`/`limit` page through long transcripts without re-extracting. '
      + 'Use this before summarizing, translating, or analyzing any YouTube video.',
    parameters: {
      type: 'object',
      properties: {
        url_or_id: {
          type: 'string',
          description: 'YouTube URL (watch/youtu.be/shorts/live/embed) or an 11-char video ID.',
        },
        lang: {
          type: 'string',
          description: "Optional caption language code, e.g. 'en', 'es', 'de'. Defaults to 'en'.",
        },
        offset: {
          type: 'integer',
          description: 'Optional character offset to start reading from (for paging a cached transcript).',
        },
        limit: {
          type: 'integer',
          description: 'Optional max characters to return from `offset`. Omit for everything up to the 150k safety cap.',
        },
      },
      required: ['url_or_id'],
    },
    timeoutMs: TIMEOUT_MS,

    async execute(args, exec) {
      const id = extractVideoId(args && args.url_or_id)
      if (!id) {
        throw new Error('youtube_transcript: could not extract an 11-char video ID from the input')
      }
      const lang =
        args && typeof args.lang === 'string' && /^[a-zA-Z-]{2,10}$/.test(args.lang)
          ? args.lang
          : 'en'
      const key = `${id}|${lang}`

      let text = cached(key)
      if (text === null) text = await extract(id, lang, exec.signal)
      if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS)

      const totalChars = text.length
      let offset = Number.isFinite(args && args.offset) ? Math.max(0, Math.floor(args.offset)) : 0
      if (offset > totalChars) offset = totalChars
      const limit =
        Number.isFinite(args && args.limit) && args.limit > 0
          ? Math.min(Math.floor(args.limit), MAX_CHARS)
          : MAX_CHARS
      const transcript = text.slice(offset, offset + limit)

      return {
        videoId: id,
        language: lang,
        totalChars,
        offset,
        returnedChars: transcript.length,
        complete: offset + transcript.length >= totalChars,
        transcript,
      }
    },

    // Model-visible content: the complete paged transcript, not the UI render.
    finalizeContent(exec, result) {
      if (result.isError) return undefined
      const value = result.value
      if (!value || typeof value !== 'object') return undefined
      const header = `[youtube_transcript] ${value.videoId} · ${value.language} · `
        + `${value.returnedChars}/${value.totalChars} chars`
        + (value.complete
          ? ''
          : ' · MORE REMAINING (call again with offset=' + (value.offset + value.returnedChars) + ')')
      return [{ type: 'text', text: header + '\n' + (value.transcript || '') }]
    },

    output: {
      schema: { type: 'object' },
      render(args, value) {
        // Display-only: keep the card compact; the model reads finalizeContent.
        const t = typeof value === 'string'
          ? value
          : value && value.transcript ? String(value.transcript) : JSON.stringify(value, null, 2)
        return [{ type: 'text', text: t.slice(0, 1200) }]
      },
    },
  })

  ctx.systemPrompt.section({
    name: 'tool:youtube_transcript',
    order: 106,
    text: 'When the user shares a YouTube URL or asks about a specific video, call '
      + '`youtube_transcript` once — it returns the full transcript (cached 30 min; '
      + '`offset`/`limit` page long ones). Base summaries on the transcript and report the '
      + 'source tier honestly (caption transcript vs generated transcription) when relevant.',
  })

  console.log('[youtube-transcript] tool registered -> youtube_transcript')
}
