// A saved player identity: just enough for a picker/roster UI to show and let someone select "who
// am I this round" — deliberately nothing else. An app that needs more (a key/control scheme, a
// stats bucket, anything else keyed by profile id) extends this shape on its own, in its own
// storage layer, and structural typing carries it straight through every component here that only
// ever reads these five fields — no wrapper or adapter needed on the app's side.
export interface Profile {
  id: string
  name: string
  color: string
  // User-typed identity mark shown on a seat's own color trigger and in the profile picker/roster —
  // one emoji, or up to MAX_TAG_LENGTH plain characters (see profilesValidation.ts's isValidTag).
  // Can be empty (no tag yet), which just falls back to a generic icon wherever it's shown.
  tag: string
  createdAt: number
  updatedAt: number
}
