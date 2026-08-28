import { isValidProfile } from './profilesValidation'
import { Profile } from './types'

interface NativeTasticProfile {
  getSharedJSON(groupId: string, key: string): Promise<string | null>
  setSharedJSON(groupId: string, key: string, value: string): Promise<void>
}

// Lazily/optionally resolved — this package has no hard dependency on expo-modules-core (it's a
// peer, provided by whatever Expo app consumes it), and the native module itself only registers on
// iOS (see ios/TasticProfileModule.swift and expo-module.config.json's "apple"-only platform list).
// Guarding both the require and the lookup means Android/web, and an iOS build that hasn't run
// `expo prebuild` since adding this package yet, both degrade to "sharing unavailable" instead of a
// hard crash.
let native: NativeTasticProfile | null = null
try {
  const { requireOptionalNativeModule } = require('expo-modules-core')
  native = (requireOptionalNativeModule('TasticProfile') ?? null) as NativeTasticProfile | null
} catch {
  native = null
}

const PROFILES_KEY = 'sharedProfiles'

// True once at module load — a consuming app uses this to decide whether to fall back to its own
// local-only storage for the base roster too (see this package's README's App Group section).
export const isSharedProfileStoreAvailable = native !== null

// Reads the shared base-identity roster out of a given App Group suite. Always resolves to an
// array, never null/throws — an unavailable store, a missing/empty blob, and a corrupt blob all
// read the same as "nothing shared yet." Entries that fail isValidProfile are dropped individually
// rather than invalidating the whole roster, since the base fields validated here are the ONLY
// thing this store is a source of truth for — a host app's own extension fields (a control scheme,
// anything else) never travel through it at all; see the README for the base/extension split this
// is meant to be used with.
export async function loadSharedProfiles(groupId: string): Promise<Profile[]> {
  if (!native) return []
  let json: string | null = null
  try {
    json = await native.getSharedJSON(groupId, PROFILES_KEY)
  } catch {
    return []
  }
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter(isValidProfile) : []
  } catch {
    return []
  }
}

// Overwrites the entire shared roster — same whole-blob-write discipline a host app's own
// AsyncStorage-backed profile store already uses, not an incremental per-profile update. A write
// failure (store unavailable, or some other native error) is swallowed rather than thrown: the
// caller's own local state is already the source of truth for what just changed, and this is a
// best-effort mirror of it, not the other way around.
export async function saveSharedProfiles(groupId: string, profiles: Profile[]): Promise<void> {
  if (!native) return
  try {
    await native.setSharedJSON(groupId, PROFILES_KEY, JSON.stringify(profiles))
  } catch {
    // Best-effort — see doc comment above.
  }
}
