import { isSharedProfileStoreAvailable, readSharedProfiles, saveSharedProfiles } from '../sharedProfileStore'
import { Profile } from '../types'

// Resolves the roster an app should start with, given whatever it already had saved in its own
// local fallback storage (however that app stores it - this never touches AsyncStorage itself,
// only the shared App Group store via readSharedProfiles/saveSharedProfiles). Every @tastic game
// hand-rolled an identical version of this exact decision inline in its own useProfiles.tsx; this
// is that logic, extracted verbatim.
//
// - Shared store unavailable (Android, a web page that can't write localStorage, or an iOS build
//   that hasn't run `expo prebuild` since the entitlement was added): `localFallback` IS the
//   roster, verbatim.
// - Shared store available, but its roster couldn't be read (readSharedProfiles' null):
//   `localFallback`, and nothing is written. Seeding here would overwrite every other app's
//   profiles with this app's local snapshot.
// - Shared store available, and genuinely empty: either a first launch, or the first time THIS
//   app has synced since the App Group entitlement was added - seed it from `localFallback` (so
//   an upgrading user's own profiles don't just vanish), and mirror that seed to the shared store
//   (fire-and-forget; a failed seed write just means the next successful write catches up).
// - Shared store available and non-empty: shared always wins over a stale local snapshot, never
//   merged with it - avoids resurrecting a profile that was deleted from another app.
export async function resolveInitialProfiles(groupId: string, localFallback: Profile[]): Promise<Profile[]> {
  if (!isSharedProfileStoreAvailable) return localFallback
  const shared = await readSharedProfiles(groupId)
  if (shared === null) return localFallback
  if (shared.length === 0 && localFallback.length > 0) {
    saveSharedProfiles(groupId, localFallback).catch(() => {})
    return localFallback
  }
  return shared
}
