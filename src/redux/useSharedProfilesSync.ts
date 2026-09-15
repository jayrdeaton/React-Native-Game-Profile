import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'

import { isSharedProfileStoreAvailable, loadSharedProfiles, saveSharedProfiles } from '../sharedProfileStore'
import { Profile } from '../types'

export interface UseSharedProfilesSyncOptions {
  groupId: string
  // Called with a freshly-read shared roster whenever the app returns to the foreground — the
  // shared store has no cross-process change notification, so this is what catches "edited a
  // profile in a different @tastic app, then switched back to this one." Skipped while a
  // syncToShared write is still in flight (see pendingWriteRef below), and never called at all
  // when the shared store isn't available.
  onRemoteChange: (profiles: Profile[]) => void
}

export interface UseSharedProfilesSyncResult {
  // Call right after applying a roster change locally (dispatching profilesActions.setAll/add/
  // update/remove) to mirror it to the shared store. No-ops when the shared store isn't available
  // — the caller is responsible for its own local persistence in that case, same as before this
  // hook existed. Fire-and-forget: never throws, never awaited by this hook itself.
  syncToShared: (next: Profile[]) => void
}

// Bundles the two things every @tastic game needs around the shared App Group roster once
// `profiles` lives in its own Redux store: mirroring local writes out to the shared store, and
// picking up remote writes a sibling app made while this one was backgrounded. Deliberately
// separate from resolveInitialProfiles — that one's for the one-time initial load, this one's for
// the app's whole lifetime after that.
export function useSharedProfilesSync({ groupId, onRemoteChange }: UseSharedProfilesSyncOptions): UseSharedProfilesSyncResult {
  // True for the duration of an in-flight syncToShared write — the foreground-refresh effect below
  // skips a refresh while this is true, rather than risk reading back a pre-write snapshot and
  // handing the caller an onRemoteChange that reverts the write still landing. A ref, not state:
  // read from inside the AppState listener's closure, which is only created once per subscription
  // and would otherwise see whatever this was at mount time, forever.
  const pendingWriteRef = useRef(false)
  // Same reasoning, for onRemoteChange itself — an app typically passes an inline callback that
  // closes over its own latest dispatch/state, so the listener must always call the current one,
  // not whichever was in scope when the effect below first subscribed.
  const onRemoteChangeRef = useRef(onRemoteChange)
  useEffect(() => {
    onRemoteChangeRef.current = onRemoteChange
  }, [onRemoteChange])

  useEffect(() => {
    if (!isSharedProfileStoreAvailable) return
    let cancelled = false
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || pendingWriteRef.current) return
      loadSharedProfiles(groupId).then((shared) => {
        if (!cancelled) onRemoteChangeRef.current(shared)
      })
    })
    return () => {
      cancelled = true
      sub.remove()
    }
  }, [groupId])

  const syncToShared = useCallback(
    (next: Profile[]) => {
      if (!isSharedProfileStoreAvailable) return
      pendingWriteRef.current = true
      saveSharedProfiles(groupId, next)
        .catch(() => {})
        .finally(() => {
          pendingWriteRef.current = false
        })
    },
    [groupId]
  )

  return { syncToShared }
}
