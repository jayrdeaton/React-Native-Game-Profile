import { Platform } from 'react-native'

import { isValidProfile } from './profilesValidation'
import { Profile } from './types'

interface NativeTasticProfile {
  getSharedJSON(groupId: string, key: string): Promise<string | null>
  setSharedJSON(groupId: string, key: string, value: string): Promise<void>
}

// Lazily/optionally resolved - this package has no hard dependency on expo-modules-core (it's a
// peer, provided by whatever Expo app consumes it), and the native module itself only registers on
// iOS (see ios/TasticProfileModule.swift and expo-module.config.json's "apple"-only platform list).
// Guarding both the require and the lookup means Android, and an iOS build that hasn't run
// `expo prebuild` since adding this package yet, both degrade to "sharing unavailable" instead of a
// hard crash. The web has a store of its own, below.
let native: NativeTasticProfile | null = null
try {
  const { requireOptionalNativeModule } = require('expo-modules-core')
  native = (requireOptionalNativeModule('TasticProfile') ?? null) as NativeTasticProfile | null
} catch {
  native = null
}

const PROFILES_KEY = 'sharedProfiles'

// The App Group's suite and key, flattened into one localStorage key: `<groupId>:sharedProfiles`.
const webKey = (groupId: string, key: string) => `${groupId}:${key}`

// The web build's stand-in for the native module. Every game in the group is served from one
// origin (games.infinitetoken.com/<game>/), so they all see the same localStorage, which plays the
// App Group's part. It has the native module's shape, so readSharedProfiles and saveSharedProfiles
// below don't change. Null (sharing unavailable, as before) off the web, and when localStorage
// can't be written at all: touching it can throw (storage blocked, a sandboxed frame), and a store
// that took every write and kept none would wipe the roster (a save fails silently, the key stays
// missing, the next read comes back [] and the app is handed that as its roster). So it writes and
// removes a probe once, at load. After a write that fails anyway (the storage quota), reads fail
// until a write succeeds again, so an older roster still in storage can't undo a change the app
// has already made locally.
const createWebStore = (): { store: NativeTasticProfile; storage: Storage } | null => {
  if (Platform.OS !== 'web') return null
  try {
    const storage = globalThis.localStorage
    if (!storage) return null
    const probe = webKey('@tastic/profile', 'probe')
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    let lastWriteFailed = false
    return {
      storage,
      store: {
        getSharedJSON: async (groupId, key) => {
          if (lastWriteFailed) throw new Error('The last write to the shared roster failed')
          return storage.getItem(webKey(groupId, key))
        },
        setSharedJSON: async (groupId, key, value) => {
          try {
            storage.setItem(webKey(groupId, key), value)
            lastWriteFailed = false
          } catch (error) {
            lastWriteFailed = true
            throw error
          }
        }
      }
    }
  } catch {
    return null
  }
}

const web = native ? null : createWebStore()
if (web) native = web.store

// True once at module load - a consuming app uses this to decide whether to fall back to its own
// local-only storage for the base roster too (see this package's README's App Group section).
export const isSharedProfileStoreAvailable = native !== null

// A stored roster's JSON as profiles: [] for nothing stored, null for a blob that isn't a readable
// roster (not JSON, not an array, or entries none of which are valid). Entries that fail
// isValidProfile are dropped individually rather than invalidating the whole roster.
const parseRoster = (json: string | null): Profile[] | null => {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return null
    const profiles = parsed.filter(isValidProfile)
    return parsed.length > 0 && profiles.length === 0 ? null : profiles
  } catch {
    return null
  }
}

// Reads the shared base-identity roster out of a given App Group suite, telling a failed read
// apart from an empty roster. Resolves to [] when nothing has been shared yet (a missing/empty
// blob) or the store is unavailable, and to null when the store is there but its roster couldn't
// be read: the native call threw, the blob isn't JSON or isn't an array, or it held entries and
// none of them were valid. Never throws. Entries that fail isValidProfile are dropped individually
// rather than invalidating the whole roster, since the base fields validated here are the ONLY
// thing this store is a source of truth for - a host app's own extension fields (a control scheme,
// anything else) never travel through it at all; see the README for the base/extension split this
// is meant to be used with.
//
// A caller that replaces its roster with what it reads, or writes the roster back afterward, must
// skip a null: taken as an empty roster, a failed read empties the app's roster, and its next
// write then deletes every profile from the shared store, for every app in the group.
export async function readSharedProfiles(groupId: string): Promise<Profile[] | null> {
  if (!native) return []
  let json: string | null = null
  try {
    json = await native.getSharedJSON(groupId, PROFILES_KEY)
  } catch {
    return null
  }
  return parseRoster(json)
}

// readSharedProfiles with a failed read flattened to []: always resolves to an array, never
// null/throws. Kept unchanged for apps that call it directly; prefer readSharedProfiles anywhere a
// read can replace the roster or lead to a write (see its doc above).
export async function loadSharedProfiles(groupId: string): Promise<Profile[]> {
  return (await readSharedProfiles(groupId)) ?? []
}

const hasId = (entry: unknown): entry is { id: string } => typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string' && (entry as { id: string }).id !== ''

// The stored roster's entries this version can't read (they fail isValidProfile: a newer app's
// profile under a rule loosened since, say) and that aren't in `profiles`, so saveSharedProfiles can
// write them back as they are. This app never had them in its roster, so a save that left them out
// would delete them for every app in the group. Only entries with an id are kept (anything else is
// unusable to every app). [] when the stored roster can't be read at all. The web store is read
// directly, past its failed-write latch: that latch is there so a stale roster can't replace a
// local one, and nothing read here replaces anything.
async function unreadableEntries(groupId: string, profiles: Profile[]): Promise<unknown[]> {
  let json: string | null | undefined
  try {
    json = web ? web.storage.getItem(webKey(groupId, PROFILES_KEY)) : await native?.getSharedJSON(groupId, PROFILES_KEY)
  } catch {
    return []
  }
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    const saved = new Set(profiles.map((profile) => profile.id))
    return parsed.filter((entry) => !isValidProfile(entry) && hasId(entry) && !saved.has(entry.id))
  } catch {
    return []
  }
}

// Overwrites the entire shared roster - same whole-blob-write discipline a host app's own
// AsyncStorage-backed profile store already uses, not an incremental per-profile update - except
// for the stored entries this version can't read, which it keeps (see unreadableEntries), after
// `profiles`. A write failure (store unavailable, or some other native error) is swallowed rather
// than thrown: the caller's own local state is already the source of truth for what just changed,
// and this is a best-effort mirror of it, not the other way around. A failed read before it writes
// `profiles` alone, as every save did before entries were kept.
export async function saveSharedProfiles(groupId: string, profiles: Profile[]): Promise<void> {
  if (!native) return
  try {
    const kept = await unreadableEntries(groupId, profiles)
    await native.setSharedJSON(groupId, PROFILES_KEY, JSON.stringify([...profiles, ...kept]))
  } catch {
    // Best-effort - see doc comment above.
  }
}

// Calls `listener` with the roster another tab or game on this origin has just saved (the
// browser's `storage` event, which never fires in the tab that wrote). The same parse as
// readSharedProfiles; a roster that can't be read is skipped, and so is the key's removal (or a
// whole-storage clear), so neither can spread a wipe. Returns the unsubscribe. Does nothing on
// native, where the App Group has no change notification (useSharedProfilesSync re-reads when the
// app comes back to the foreground instead), and on the web when the store isn't available.
export function subscribeSharedProfiles(groupId: string, listener: (profiles: Profile[]) => void): () => void {
  if (!web || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
  const storageKey = webKey(groupId, PROFILES_KEY)
  const storage = web.storage
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || event.storageArea !== storage || !event.newValue) return
    const profiles = parseRoster(event.newValue)
    if (profiles !== null) listener(profiles)
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
