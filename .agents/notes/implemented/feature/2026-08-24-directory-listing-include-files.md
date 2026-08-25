# Agent Note: File listings with child files (`host.listDirectory` includeFiles)

Status: implemented

English | [中文](2026-08-24-directory-listing-include-files.zh.md)

## Problem

The browse directory listing served directories only — it exists for the workspace picker, which can only enter directories. A GUI surface that presents a directory's actual content (a file explorer) had no wire route to its files: the closed RPC map offers no other filesystem listing, and the dynamic-runner package RPC (`harness.handle`) does not exist for statically composed client plugins.

## Decision

`host.listDirectory` gains an opt-in per-call option instead of a second method: `includeFiles: true` appends the child regular files after the directories, sharing the level's `maxEntries` bound and `truncated` flag. `DirectoryEntry` gains a required `kind: 'directory' | 'file'` discriminant so a listing that included files is self-describing on the wire; crumbs are always `kind: 'directory'`. The picker flows never set the option and their behavior is unchanged.

### Classification moves into the stream

The browse backend previously admitted only directories and symlinks into the bounded window and probed symlinks after the window cut. With files in the mix, that deferred classification breaks the contract order: a symlink-to-file rides the directory block by name and only turns out to be a file at probe time, so a file row lands between directory rows. Classification therefore happens before window insertion — `kindOf` resolves each dirent in-stream (dirent kind outright, a symlink by its raced `stat` probe, broken links to null), and `ListingCandidate` shrinks to `{ name, kind }`. The window order — directories before files, name-ascending inside each kind — and the kept head are exact; the post-window probe stage disappears.

## Alternatives considered

- **A second wire method (`host.listFiles`).** Rejected: it would duplicate the bounded-window scan, the ancestry chain, and the error mapping for one flag's worth of difference, and every future listing improvement would land twice.
- **Extending the `ctx.fs` seam instead.** Rejected for the seam reason already recorded in the capability-seam note: the model-facing storage stack must not couple to GUI browsing, and OS presentation facts are not storage primitives.
- **Keeping deferred symlink probes and re-sorting entries after the cut.** Rejected: the kept set would no longer be the true ordered head (a small-named symlink-to-file could displace a real directory from a cut level), silently breaking `truncated`'s "ordered tail is absent" meaning.

## Consequences

- The wire schema (`directoryEntrySchema`) requires `kind`; the client wire types flow from the apiproxy contract, so every consumer picks the field up from one source.
- A symlink-to-file now costs its `stat` during streaming rather than after the cut; symlink-heavy levels pay one raced probe per link, and broken links never enter the window at all.
- The kept head is the exact ordered head of the level, so `truncated` keeps its "the ordered tail is absent" meaning for combined listings.
- First consumer: the user-local `dsh-file-explorer` GUI plugin (junction-delivered, profile patch row), which renders the workspace tree with files through `ctx.workspaces.listDirectory(path, signal, { includeFiles: true })`.
