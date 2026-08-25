/**
 * Browse backend of the directory-picker seam: registers `ctx.directoryPicker`
 * with the `browse` capability — one-level directory listing and child-directory
 * creation over the host filesystem via Node's stdlib (which already carries
 * the per-OS adaptation). Nothing renders on the host display, so this backend
 * serves remote clients the dialog backend cannot. Policy decisions (hidden
 * entries flagged but returned, symlinks followed, whole-filesystem scope) are
 * recorded in the directory-picker seam Agent Note.
 * @module @deepseek-ai/dsh-host-directory-picker-browse
 */

import { mkdir, opendir, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, posix, resolve, win32 } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  DirectoryPicker, DirectoryPickerError,
} from '@deepseek-ai/dsh-host-directory-picker'
import type {
  DirectoryEntry, DirectoryListOptions, DirectoryListing, DirectoryPickerCapability,
} from '@deepseek-ai/dsh-host-directory-picker'

/**
 * Ancestor chain from the filesystem root to `target` inclusive — the
 * breadcrumb rows of a listing, every one a jump target.
 */
function ancestryCrumbs(target: string): DirectoryEntry[] {
  const crumbs: DirectoryEntry[] = []
  let current = target
  for (;;) {
    const parent = dirname(current)
    // basename of a root is '' — label the root crumb by its full path ('/', 'C:\').
    crumbs.unshift({ name: parent === current ? current : basename(current), path: current, hidden: false, kind: 'directory' })
    if (parent === current) return crumbs
    current = parent
  }
}

/**
 * True when the path names one fixed filesystem location regardless of
 * process state: POSIX-absolute on POSIX; on Windows only drive-qualified
 * (`C:\…`) or complete UNC (`\\server\share…`) forms. Rooted drive-less
 * forms (`\foo`, `/foo`) and incomplete UNC prefixes (`\\`, `\\server`)
 * pass `isAbsolute` yet still resolve against the process's current drive.
 * @param path - candidate path.
 * @param platform - replaces `process.platform` for deterministic tests.
 * @returns whether the path is fully qualified on the platform.
 */
export function fullyQualified(path: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32'
    ? win32.isAbsolute(path) && /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/]+[^\\/]+)/.test(path)
    : posix.isAbsolute(path)
}

/**
 * One streamed listing candidate, fully classified: dirents carry their kind
 * outright, and a symlink is resolved by its stat probe before it may contend
 * for the window — the ordering (and therefore the kept head) must be exact,
 * so a deferred classification cannot re-sort rows across kinds later.
 */
export interface ListingCandidate {
  /** Base name within the streamed level. */
  name: string
  /** What the child resolves to: a directory (or symlink to one) or a regular file (or symlink to one). */
  kind: 'directory' | 'file'
}

/**
 * The listing order: directories before files, name-ascending inside each
 * kind. With files excluded every candidate is a directory, so the kind term
 * is constant and this is the plain name order.
 * @param a - first candidate.
 * @param b - second candidate.
 * @returns a localeCompare-style negative/zero/positive ordering value.
 */
function compareCandidates(a: ListingCandidate, b: ListingCandidate): number {
  const kindOrder = (a.kind === 'file' ? 1 : 0) - (b.kind === 'file' ? 1 : 0)
  return kindOrder !== 0 ? kindOrder : a.name.localeCompare(b.name)
}

/**
 * Insert a streamed candidate into the bounded window ordered by
 * {@link compareCandidates}, evicting the ordering-largest candidate when the
 * window exceeds `keep`. Memory over an arbitrarily large level therefore
 * stays O(keep) regardless of how many children the directory holds.
 * @param window - the ordered window, mutated in place.
 * @param candidate - the streamed candidate to place.
 * @param keep - the window bound.
 * @returns true when an eviction happened (the level has candidates beyond the window).
 */
export function boundedInsert(window: ListingCandidate[], candidate: ListingCandidate, keep: number): boolean {
  // Full window, candidate at or beyond the tail: one comparison rejects, so
  // an oversized level costs O(1) per candidate past the head instead of a
  // window scan (100k children against a 1,001 window must not approach
  // 10^8 comparisons).
  // oxlint-disable-next-line typescript/no-non-null-assertion -- a full window (length === keep >= 1) has a tail
  if (window.length === keep && compareCandidates(candidate, window[window.length - 1]!) >= 0) return true
  // Binary insertion keeps a retained candidate at O(log keep) comparisons.
  let lo = 0
  let hi = window.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded by the loop condition
    if (compareCandidates(candidate, window[mid]!) < 0) hi = mid
    else lo = mid + 1
  }
  window.splice(lo, 0, candidate)
  if (window.length <= keep) return false
  window.pop()
  return true
}

/**
 * Await `operation`, but reject with the signal's reason the moment it
 * aborts. Node's filesystem reads are not retractable, so the operation
 * itself keeps running against a handle the caller then closes — its late
 * settlement is swallowed here so an abandoned read cannot surface as an
 * unhandled rejection.
 * @param operation - the in-flight filesystem step.
 * @param signal - caller lifetime; absent means plain awaiting.
 * @returns the operation's value.
 */
export function raceAbort<T>(operation: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return operation
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      operation.catch(() => {
        // Abandoned read: its handle is being closed by the aborting caller,
        // and the abort reason already carried the outcome.
      })
      reject(asError(signal.reason))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (reason: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(asError(reason))
      },
    )
  })
}

/** The thrown value as an Error (wire/abort reasons may be anything). */
function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason))
}

/* v8 ignore start -- a close failure of an abandoned handle has no consumer, and forcing one needs a filesystem torn down mid-request. */
/** Swallow the close failure of a handle its caller already departed. */
function swallowCloseFailure(): void {}
/* v8 ignore stop */

/** Message text of an unknown thrown value. */
function messageOf(error: unknown): string {
  /* v8 ignore next -- node:fs rejects with Error instances; the String arm only satisfies the unknown narrowing. */
  return error instanceof Error ? error.message : String(error)
}

/**
 * Resolve one dirent to its row kind before it may contend for the window:
 * dirents carry their kind outright, and a symlink's stat probe decides
 * directory vs file (a file only when the call includes files). Null skips
 * the child: rows the call does not want, and broken/cyclic links (skipped
 * silently — a broken link is neither enterable nor a readable file).
 * @param parent - absolute directory holding the dirent.
 * @param name - dirent base name.
 * @param dirent - the streamed directory entry.
 * @param includeFiles - whether regular files (and symlinks resolving to
 * files) become rows.
 * @param signal - caller lifetime; abort rejects the whole listing.
 * @returns the resolved kind, or null to skip the child.
 */
async function kindOf(
  parent: string,
  name: string,
  dirent: Dirent,
  includeFiles: boolean,
  signal: AbortSignal | undefined,
): Promise<'directory' | 'file' | null> {
  if (dirent.isDirectory()) return 'directory'
  if (dirent.isFile()) return includeFiles ? 'file' : null
  if (!dirent.isSymbolicLink()) return null
  try {
    // The probe races the caller too: a symlink target on a stalled network
    // filesystem must not keep a departed caller's scan alive.
    const stats = await raceAbort(stat(join(parent, name)), signal)
    return stats.isDirectory() ? 'directory' : stats.isFile() && includeFiles ? 'file' : null
  } catch {
    /* v8 ignore next 2 -- an abort landing mid-probe needs a stalled stat; the stream loop's own raced reads cover the settled path. */
    if (signal?.aborted) throw asError(signal.reason)
    return null
  }
}

/** Validated plugin configuration. */
export interface Config {
  /** Complete-result bound of one listing level; see {@link BrowseDirectoryPicker.Config}. */
  maxEntries: number
}

/** The `ctx.directoryPicker` browse implementation (stable capability object per service life). */
export default class BrowseDirectoryPicker extends DirectoryPicker {
  /**
   * `maxEntries` bounds the complete listing level a single `list` call may
   * materialize and put on the wire: at most this many child rows (hidden
   * rows included; directories and, when requested, files share the bound),
   * with `truncated` flagging a cut level. The default follows GitHub's web
   * UI, which truncates directory listings at 1,000 entries.
   */
  static Config: z<Config> = z.object({
    maxEntries: z.natural().min(1).default(1000),
  })

  private readonly browseCapability: DirectoryPickerCapability = {
    kind: 'browse',
    list: (path, signal, opts) => this.list(path, signal, opts),
    createDirectory: (path, name) => this.createDirectory(path, name),
  }

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx)
  }

  /**
   * The browse interaction capability.
   * @returns the stable `browse` capability object.
   */
  capability(): DirectoryPickerCapability {
    return this.browseCapability
  }

  private async list(path?: string, signal?: AbortSignal, opts?: DirectoryListOptions): Promise<DirectoryListing> {
    const includeFiles = opts?.includeFiles === true
    const home = homedir()
    // The seam contract takes fully qualified paths only; resolve() would
    // silently rebase a relative or empty wire value under the host process
    // cwd (or, for rooted drive-less Windows forms, its current drive).
    if (path !== undefined && !fullyQualified(path)) {
      throw new DirectoryPickerError('directory-unreadable', path, `cannot list "${path}": not a fully qualified path`)
    }
    const target = resolve(path ?? home)
    // Stream the level (opendir, one dirent at a time, each child classified
    // by kindOf before it contends) into an ordered window of maxEntries + 1
    // candidates: memory stays bounded no matter how many children the
    // directory holds, the window keeps the ordered head, and the +1 slot
    // lets an in-window extra row prove the cut. An eviction already marks
    // the level truncated, which stays the honest answer.
    const keep = this.config.maxEntries + 1
    const window: ListingCandidate[] = []
    let evicted = false
    try {
      // Every filesystem await races the caller's signal: a stalled
      // opendir/read on a network filesystem must not keep a departed
      // caller's scan alive, and an already-aborted request rejects even
      // when the level is empty.
      const opening = opendir(target)
      const level = await raceAbort(opening, signal).catch((error: unknown) => {
        // The abandoned open can still mint a handle after the abort won;
        // close it so a departed caller cannot leak a descriptor. (A lost
        // race against opendir's own rejection has nothing to close, and
        // the close's own failure is swallowed — the request already
        // returned, so a cleanup error has no consumer.)
        void opening.then(dir => dir.close().catch(swallowCloseFailure), () => {
          // Already rejected: raceAbort surfaced or swallowed it.
        })
        throw error
      })
      try {
        for (;;) {
          const dirent = await raceAbort(level.read(), signal)
          if (dirent === null) break
          // Classification happens before insertion (symlinks probed here,
          // raced by the signal): the window order — directories before
          // files, name-ascending inside each kind — must be exact, so a
          // child whose kind is not yet known cannot contend. A broken link
          // is resolved to null here and never enters the window.
          const kind = await kindOf(target, dirent.name, dirent, includeFiles, signal)
          if (kind === null) continue
          if (boundedInsert(window, { name: dirent.name, kind }, keep)) evicted = true
        }
      } finally {
        // Manual read() never auto-closes; close on every exit. The aborted
        // exit must not await it — Node queues close behind any in-flight
        // read, so awaiting would chain the departed caller back onto the
        // very stall the abort escaped (the abandoned read's settlement is
        // already swallowed by raceAbort).
        const closing = level.close()
        /* v8 ignore next 3 -- an abort between open and close needs a stalled read; the abandoned-close arm has no observable outcome. */
        if (signal?.aborted) {
          closing.catch(swallowCloseFailure)
        } else {
          await closing
        }
      }
    } catch (error: unknown) {
      // An abort is the caller's own reason, not an unreadable directory.
      signal?.throwIfAborted()
      throw new DirectoryPickerError('directory-unreadable', target, `cannot list ${target}: ${messageOf(error)}`)
    }
    const entries: DirectoryEntry[] = []
    let truncated = evicted
    for (const candidate of window) {
      // Candidates left the window fully classified (kindOf ran in-stream),
      // so the kept head is already the exact ordered head of the level.
      if (entries.length === this.config.maxEntries) {
        truncated = true
        break
      }
      // POSIX hidden convention; Windows' hidden attribute is not exposed by
      // dirents (Known Limitations). The client owns whether hidden rows show.
      entries.push({
        name: candidate.name,
        path: join(target, candidate.name),
        hidden: candidate.name.startsWith('.'),
        kind: candidate.kind,
      })
    }
    return { path: target, home, crumbs: ancestryCrumbs(target), entries, truncated }
  }

  private async createDirectory(path: string, name: string): Promise<string> {
    // Same fully-qualified fence as list: never rebase a parent under the
    // cwd or the current drive.
    if (!fullyQualified(path)) {
      throw new DirectoryPickerError('directory-create-failed', path, `cannot create under "${path}": not a fully qualified parent path`)
    }
    const parent = resolve(path)
    // The backend owns segment validation (the wire schema also refuses these,
    // but direct service consumers must hit the same fence).
    if (name.trim() === '' || name === '.' || name === '..' || /[/\\]/.test(name)) {
      throw new DirectoryPickerError('directory-create-failed', join(parent, name), `"${name}" is not a single path segment`)
    }
    const target = join(parent, name)
    try {
      // Non-recursive: the parent is the directory the browser is showing, so
      // a missing parent is a real failure, not a level to invent.
      await mkdir(target)
      return target
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
        throw new DirectoryPickerError('directory-exists', target, `${target} already exists`)
      }
      throw new DirectoryPickerError('directory-create-failed', target, `cannot create ${target}: ${messageOf(error)}`)
    }
  }
}
