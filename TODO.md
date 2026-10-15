# TODO

Follow-ups from the 2026-10-15 fixes (see CLAUDE.md, "Bug fixes (2026-10-15)"). Line numbers are as of that date.

## Shared roster

1. **A partly invalid roster can still lose profiles.** `readSharedProfiles` drops entries that fail this version's `isValidProfile` and only treats an all-invalid roster as a failed read. If a newer app saves a profile an older app's validator rejects (a tag rule loosened later, say), the older app drops it from its roster, and its next save writes the roster back without it, deleting it for every app. Options: keep the rejected entries and pass them through on save, or make saves merge by id instead of replacing the whole blob.
