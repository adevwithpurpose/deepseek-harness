# Agent Note: Model search in the fetch picker and composer selector

Status: implemented

English | [中文](2026-08-14-model-search-in-picker-and-selector.zh.md)

## Problem

Two model surfaces have no way to find a model by name when the list is long. The fetch-models dialog in the Models settings section (ui-settings-models `ModelListEditor`) lists every discovered candidate as one checkbox row; the composer's model seat (ui-model-selection `ModelSelect`) lists provider groups with every advertised model. The OmniRoute deployment trims the catalog to 13, but any gateway that still lists hundreds makes both surfaces an eyes-down scan.

## Decision

Both surfaces gain a text search that narrows what is visible without touching the selection state.

**Fetch dialog.** A search field sits between the bulk toolbar and the candidate list. The visible set is candidates whose id or name contains the query (case-insensitive substring); hidden candidates keep their checkboxes, so searching is a pure view filter. "Select all" acts on the visible (filtered) candidates, while "Deselect all" always clears the whole selection — the asymmetry is deliberate: each button reads literally in every state, and a full clear is the recovery from any filter. When no candidate matches, the dialog shows a no-match message instead of the list. The query resets when the dialog opens (`fetchModels`) and closes (`closePicker`).

**Composer selector.** A search field sits above the model list in the model pane. Each provider group keeps only matching models (id or name substring, case-insensitive) and a group with no matches disappears; when every group is gone the menu shows a no-match message. The query resets on every menu open (`show()`). ArrowDown/ArrowUp from outside the item list (the search field or the trigger) now start at the first/last item instead of a stale index, so the new focusable field does not misdirect keyboard navigation.

Copy is localized: `searchModels` / `searchNoMatch` in ui-settings-models (en source), `search.placeholder` / `empty.matches` in ui-model-selection (zh source). Component tests cover filtered select-all vs global deselect-all, the no-match message and restore, id/name matching, case-insensitivity, and empty-group hiding.

## Alternatives considered

**Include the group/provider name in the match.** Rejected: the model is the unit of selection, and the provider name already appears as the group title above each section; matching models by their own id and name is the least surprising filter, and provider search belongs to a provider list, not this menu.

**Filter the selection, not the view** (uncheck non-matching rows while typing). Rejected: a view filter never surprises — closing the dialog or clearing the query restores exactly the checks the user made — while mutating the selection mid-search would destroy a curated pick the user can no longer see.

**Select only matches as you type.** Rejected: that makes typing destructive. Select-all stays an explicit gesture, and its visible-set semantics are documented by the toolbar's placement directly under the search field.

## Consequences

Both surfaces need no server or directory change: filtering is local to the component over already-loaded data. The deliberate asymmetry (filtered select-all, global deselect-all) is the one behavior worth calling out, and it is covered by tests in `provider-form.client.spec.tsx` and `model-select.client.spec.tsx`. The search is invisible until a list is long enough to need it, and costs two locale keys per surface.
