# Agent Note: Bulk select and deselect in the model picker

Status: implemented

English | [中文](2026-08-14-bulk-select-deselect-model-picker.zh.md)

## Problem

The fetch-models dialog in the Models settings section (ui-settings-models `ModelListEditor`) opens with every newly discovered model pre-checked, and the only way to reduce the selection is to uncheck rows one by one. A gateway that lists hundreds of models (the OmniRoute deployment catalog lists 608) makes a small curated pick a hundreds-of-clicks chore, and the dialog offers no bulk way to start over.

## Decision

The dialog's candidate list gains two bulk controls above it, rendered as the same quiet `linkButton` capsules as the card header actions: "Select all" checks every listed candidate, and "Deselect all" clears the whole selection. Adoption semantics are unchanged: a row already configured keeps its tuned capacities (`byId.get(candidate.id) ?? adopt(candidate)`), so re-selecting a known model is a no-op, and an empty selection stores an empty `models` array, which restores built-in catalog behavior. Copy is localized through the `selectAll` / `deselectAll` keys in `locales.ts` (en/zh). Two component tests cover the controls: deselect-all followed by an empty adoption, and select-all restoring every row after a bulk clear.

## Alternatives considered

**Select all that skips already-configured models.** Rejected: "select all" reads literally, and the adoption path already makes re-selecting a configured row a no-op that preserves the user's tuned values, so checking everything is always safe and never rewrites a corrected capacity.

**A single toggle button** (select-all when not everything is picked, deselect-all otherwise). Rejected: the label would flip mid-interaction, and the target state is not derivable from the mixed selections the dialog allows, so two explicit controls are the predictable surface.

## Consequences

The footer's "Add selected" keeps its meaning: nothing checked adds nothing. The cost is two more controls in the dialog, and the literal select-all can check rows that are already configured, which reads as a no-op on adopt — consistent with the dialog's existing allowance of manually re-checking a configured row.
