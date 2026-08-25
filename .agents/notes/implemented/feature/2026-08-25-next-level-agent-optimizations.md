# Next-level agent optimizations

## Status

Implemented on the routed subagent branch. This note records the shipped extension points and verification scope.

## Decision

Task routes carry bounded output tokens and model-attempt limits, plus a write policy. The `code` route is the only active route with write access in the user-owned `code-lean` preset, scoped to the DeepSeek Harness tree; other routes are read-only. The route's selected model chain is preserved in continuable descriptors.

Filesystem mutation remains behind the existing `fs/write-intent` and `fs/edit-intent` policy listeners. A child with a declared `writeScope` is denied when the target's canonical identity falls outside its prefixes; matching runs against `FsTarget.targetKey`, the provider's realpath-derived identity, so an in-scope symlink cannot widen the scope to the link's destination, and prefix comparison requires a directory boundary so a sibling name (`src` vs `src-evil`) does not match. The tool remediator preserves the typed `FS_WRITE_SCOPE` failure while explaining the recovery path. Legacy actors without a declared scope retain existing behavior; an explicit empty scope is read-only.

Semantic code intelligence stays on the existing LSP seam. `prepareRename` adds a read-only safe rename preview without accepting arbitrary JSON-RPC or applying edits. The stdio provider checks `renameProvider`, normalizes the protocol response, and the model-facing tool renders a bounded preview.

Route selection is reconstructed in the Web conversation as a replayable `model-route-selected` node from `llm/route-selected`; the existing failover node remains the transition outcome. This keeps UI visibility derived from durable events rather than a client-only cache.

## Consequences

- `modelRouteMaxTokens` and `writeScope` are persisted for continuable cold resume; descriptor version is 5.
- Empty `writeScope` is read-only for routed children; omitted scope remains backward-compatible for non-routed actors.
- Rename preview is intentionally not a mutation and does not expose workspace/applyEdit.
- The active preset owns route policy; host/base compositions own shared filesystem/LSP capability rows.

## Verification

- Host TypeScript build: `node node_modules/typescript/bin/tsc -b tsconfig.host.json --pretty false`.
- Client TypeScript build: `node node_modules/typescript/bin/tsc -b tsconfig.client.json --pretty false`.
- Focused tests: LSP translate 31 passed; filesystem policy 29 passed (symlink escape, sibling prefix, and separator normalization included); routed subagent 68 passed; conversation definitions 22 passed.
- Composition verifier: `node --import tsx/esm scripts/verify-cordis-config.ts` reported 131 config files passed.
- Oxlint passed on all changed source/test files; `git diff --check` passed.
