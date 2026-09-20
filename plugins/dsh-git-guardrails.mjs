/**
 * Permanent Git & Workspace Safety Guardrails for DeepSeek Harness.
 *
 * Mounted by the `web` profile via cordis.patch.yml:
 *   - insert:
 *       - id: git-guardrails
 *         name: 'file:///C:/Users/saf08/.dsh/plugins/dsh-git-guardrails.mjs'
 *
 * Intercepts tool execution before dispatch via the `tools/pre-execute` waterfall.
 * Blocks dangerous, destructive Git and filesystem commands at the runtime boundary.
 */

export const name = 'git-guardrails'
export const inject = ['tools']

// Tolerates global git options between the executable and the subcommand
// (`git -C <path> …`, `git -c k=v …`, `git --no-pager …`) and both spellings
// (`git` / `git.exe`). Static indirection (`& $g reset --hard`) stays outside
// a text scanner's reach — this is a guardrail, not a sandbox.
const GIT = '\\bgit(?:\\.exe)?\\s+(?:-c\\s+\\S+\\s+|-C\\s+\\S+\\s+|--no-pager\\s+|--work-tree=\\S+\\s+)*'

const DANGEROUS_PATTERNS = [
  {
    // Matches a standalone `--force` / `-f` flag but never the prefix of
    // `--force-with-lease` (which stays allowed) nor flags like `--follow-tags`.
    regex: new RegExp(`${GIT}push\\b.*(--force(?![-\\w])|-f(?![-\\w]))`, 'i'),
    msg: 'BLOCKED by git-guardrails: Destructive `git push --force` is blocked. Use `--force-with-lease` or execute manually.',
  },
  {
    regex: new RegExp(`${GIT}reset\\s+--hard\\b`, 'i'),
    msg: 'BLOCKED by git-guardrails: Destructive `git reset --hard` is blocked. Use `git stash` or a soft reset.',
  },
  {
    regex: new RegExp(`${GIT}clean\\s+-[a-zA-Z]*f`, 'i'),
    msg: 'BLOCKED by git-guardrails: Destructive `git clean -f` is blocked.',
  },
  {
    regex: new RegExp(`${GIT}branch\\s+-[a-zA-Z]*D\\b`),
    msg: 'BLOCKED by git-guardrails: Destructive `git branch -D` is blocked.',
  },
  {
    // Recursive removal touching a protected root. Order-insensitive: the
    // recursive flag and the root may appear in either order (the previous
    // flag-then-path requirement let `Remove-Item C:\Windows -Recurse` slip).
    // pwsh aliases (rd/del/erase/ri/rm) are covered alongside Remove-Item.
    // Protected: any subpath of C:\Windows / C:\Program Files; only the exact
    // E:\Anti-Gravity root (subpaths stay workable). .NET indirection
    // ([System.IO.Directory]::Delete) stays outside a text scanner's reach.
    regex: /\b(?:rmdir|rd|ri|rm|del|erase|Remove-Item)\b(?=[\s\S]*(?:-r\b|-Recurse\b|\/s\b))(?=[\s\S]*(?:C:\\Windows\b|C:\\Program Files\b|E:\\Anti-Gravity\b(?![\/\\]|\w)))/i,
    msg: 'BLOCKED by git-guardrails: Destructive recursive removal of root workspace or system directories is blocked.',
  },
]

export function apply(ctx) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec && exec.name === 'pwsh') {
      // ToolExecution carries parsed model arguments on `arguments` (frozen,
      // JSON-normalized) — NOT `.args`.
      const rawArgs = exec.arguments
      const command =
        rawArgs && typeof rawArgs === 'object' && typeof rawArgs.command === 'string'
          ? rawArgs.command
          : ''
      for (const item of DANGEROUS_PATTERNS) {
        if (item.regex.test(command)) {
          console.warn(`[git-guardrails] Blocked execution of dangerous command: ${command}`)
          return { kind: 'deny', reason: item.msg }
        }
      }
    }
    return next()
  })

  console.log('[git-guardrails] Active — intercepting destructive git and filesystem commands on tools/pre-execute')
}
