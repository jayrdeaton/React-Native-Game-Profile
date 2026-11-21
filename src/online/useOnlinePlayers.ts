import { useEffect, useSyncExternalStore } from 'react'

import type { OnlinePlayer, OnlinePlayers, OnlineProfile } from './onlinePlayers'

// The players on this device, a profile each, kept current as they're made, renamed and removed. Loads them the first time
export function useOnlinePlayers(online: OnlinePlayers): readonly OnlinePlayer[] {
  useEffect(() => {
    void online.load()
  }, [online])
  return useSyncExternalStore(online.subscribe, online.players, online.players)
}

// Keeps the players following the roster (`sync`), and the device's pushes registered for all of them: once the roster has loaded,
// and again whenever it changes. Mount it once, where the game holds its roster
export function useOnlinePlayersSync(online: OnlinePlayers, profiles: readonly OnlineProfile[], loaded: boolean) {
  useEffect(() => {
    if (!loaded) return
    void online.sync(profiles).then(() => online.registerPushes(false))
  }, [online, profiles, loaded])
}
