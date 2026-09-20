/**
 * Permanent Git & Workspace Safety Guardrails for DeepSeek Harness.
 *
 * Mounted by the 'web' profile via cordis.patch.yml (see cordis.patch.example.yml)
 * with a repo-relative name, e.g.:
 *   - insert:
 *       - id: git-guardrails
 *         name: 'file:///<path-to-dsh-home>/plugins/dsh-git-guardrails.mjs'
 *
 * Intercepts tool execution before dispatch via the 'tools/pre-execute' waterfall.
 * Blocks dangerous, destructive Git and filesystem commands at the runtime boundary.
 *
 * Coverage: intercepts BOTH the 'pwsh' and 'bash' tool names. The Git patterns
 * apply to both shells; recursive-removal patterns are shell-specific. This is a
 * guardrail, not a sandbox: static indirection ('& $g reset --hard', Python
 * subprocesses, .NET invoke, aliases that expand at parse time) stays outside a
 * text scanner's reach.
 *
 * Configuration (environment variables, optional):
 *   DSH_GUARDRAIL_PREFIX_ROOTS  semicolon-separated roots; ANY subpath under one
 *                               of them is blocked for recursive removal.
 *                               Default: C:\Windows;C:\Program Files
 *   DSH_GUARDRAIL_EXACT_ROOTS   semicolon-separated roots; only the root itself
 *                               is blocked (needed so 'rm -rf /' is denied while
 *                               'rm -rf /home/user/...' keeps working).
 *                               Default: /
 */

export const name = 'git-guardrails'
export const inject = ['tools']

export const DEFAULT_PREFIX_ROOTS = ['C:\\Windows', 'C:\\Program Files']
export const DEFAULT_EXACT_ROOTS = ['/']

// Splits a semicolon- and/or comma-separated env list, trimming empties; an
// empty/absent variable yields the provided defaults.
function splitRoots(raw, defaults) {
  const parts = String(raw || '')
    .split(/[;,]/)
    .map(function (p) { return p.trim() })
    .filter(Boolean)
  return parts.length > 0 ? parts : defaults
}

export function resolveRoots(env) {
  const e = env || process.env
  return {
    prefix: splitRoots(e.DSH_GUARDRAIL_PREFIX_ROOTS, DEFAULT_PREFIX_ROOTS),
    exact: splitRoots(e.DSH_GUARDRAIL_EXACT_ROOTS, DEFAULT_EXACT_ROOTS),
  }
}

// Escapes every non-word character so a user-provided root can never inject
// regex operators. Letters/digits/underscore are kept verbatim.
function escForRegex(p) {
  return p.replace(/\W/g, '\\$&')
}

// Tolerates global git options between the executable and the subcommand
// ('git -C <path> ...', 'git -c k=v ...', 'git --no-pager ...') and both spellings
// ('git' / 'git.exe'). Static indirection ('& $g reset --hard') stays outside
// a text scanner's reach — this is a guardrail, not a sandbox.
const GIT = '\\bgit(?:\\.exe)?\\s+(?:-c\\s+\\S+\\s+|-C\\s+\\S+\\s+|--no-pager\\s+|--work-tree=\\S+\\s+)*'

export const GIT_PATTERNS = [
  {
    // Matches a standalone '--force' / '-f' flag but never the prefix of
    // '--force-with-lease' (which stays allowed) nor flags like '--follow-tags'.
    regex: new RegExp(GIT + 'push\\b.*(--force(?![-\\w])|-f(?![-\\w]))', 'i'),
    msg: 'BLOCKED by git-guardrails: Destructive git push --force is blocked. Use --force-with-lease or execute manually.',
  },
  {
    regex: new RegExp(GIT + 'reset\\s+--hard\\b', 'i'),
    msg: 'BLOCKED by git-guardrails: Destructive git reset --hard is blocked. Use git stash or a soft reset.',
  },
  {
    regex: new RegExp(GIT + 'clean\\s+-[a-zA-Z]*f', 'i'),
    msg: 'BLOCKED by git-guardrails: Destructive git clean -f is blocked.',
  },
  {
    regex: new RegExp(GIT + 'branch\\s+-[a-zA-Z]*D\\b'),
    msg: 'BLOCKED by git-guardrails: Destructive git branch -D is blocked.',
  },
]

export const REMOVAL_DENY_MSG =
  'BLOCKED by git-guardrails: Destructive recursive removal of root workspace or system directories is blocked.'

// Builds the recursive-removal matchers for a root configuration.
//   prefix roots: any subpath is blocked (separator may follow the root).
//   exact roots:  only the root itself is blocked (a path character or
//                 separator right after the root means "not the root").
// Order-insensitive: the recursive flag and the protected path may appear in
// either order.
export function buildRemovalPatterns(roots) {
  const r = roots || resolveRoots()
  const prefix = (r.prefix || []).map(escForRegex)
  const exact = (r.exact || []).map(escForRegex)
  const alts = []
  for (const p of prefix) alts.push('(?:' + p + ')(?=[\\\\/\\s]|$)')
  for (const p of exact) alts.push('(?:' + p + ')(?![\\\\/\\w])')
  const paths = alts.length > 0 ? '(?:' + alts.join('|') + ')' : '(?!)'
  return {
    // pwsh aliases (rd/del/erase/ri/rm) are covered alongside Remove-Item; the
    // /s switch form ('rd /s C:\Windows\Fonts') is covered by the recursive-flag
    // lookahead too. .NET indirection ([System.IO.Directory]::Delete) stays
    // outside a text scanner's reach.
    pwsh: new RegExp(
      '\\b(?:rmdir|rd|ri|rm|del|erase|Remove-Item)\\b'
      + '(?=[\\s\\S]*(?:-r\\b|-Recurse\\b|/s\\b))'
      + '(?=[\\s\\S]*' + paths + ')',
      'i'),
    bash: new RegExp(
      '\\brm\\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)'
      + '(?=[\\s\\S]*' + paths + ')',
      'i'),
  }
}

// Pure evaluation used by the hook and by the offline test suite.
// Returns { denied: boolean, message: string|null }.
export function evaluateCommand(command, toolName, roots) {
  const text = String(command || '')
  for (const item of GIT_PATTERNS) {
    if (item.regex.test(text)) return { denied: true, message: item.msg }
  }
  const removal = buildRemovalPatterns(roots)
  const matcher = toolName === 'pwsh' ? removal.pwsh : toolName === 'bash' ? removal.bash : null
  if (matcher && matcher.test(text)) return { denied: true, message: REMOVAL_DENY_MSG }
  return { denied: false, message: null }
}

export function apply(ctx) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec && (exec.name === 'pwsh' || exec.name === 'bash')) {
      // ToolExecution carries parsed model arguments on 'arguments' (frozen,
      // JSON-normalized) — NOT '.args'. Both the pwsh and bash tools use the
      // 'command' field for the script text.
      const rawArgs = exec.arguments
      const command =
        rawArgs && typeof rawArgs === 'object' && typeof rawArgs.command === 'string'
          ? rawArgs.command
          : ''
      const verdict = evaluateCommand(command, exec.name)
      if (verdict.denied) {
        console.warn('[git-guardrails] Blocked execution of dangerous command: ' + command)
        return { kind: 'deny', reason: verdict.message }
      }
    }
    return next()
  })

  console.log('[git-guardrails] Active — intercepting destructive git and filesystem commands for pwsh and bash on tools/pre-execute')
}
