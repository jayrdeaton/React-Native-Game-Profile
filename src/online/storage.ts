import { Platform } from 'react-native'

// Where each profile's online player (its key above all) is kept on the device: a few small string values, read once as the game
// starts and written as players are made, renamed and removed. Phones keep them in the Keychain (expo-secure-store, handed in);
// a browser in the site's localStorage, under the game's own keys since every game on games.infinitetoken.com shares one origin
export interface OnlineStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

// The parts of expo-secure-store this uses, so the package never imports it: hand in `import * as SecureStore from 'expo-secure-store'`
export interface SecureStoreModule {
  getItemAsync(key: string, options?: { keychainAccessible?: number }): Promise<string | null>
  setItemAsync(key: string, value: string, options?: { keychainAccessible?: number }): Promise<void>
  deleteItemAsync(key: string, options?: { keychainAccessible?: number }): Promise<void>
  AFTER_FIRST_UNLOCK?: number
}

// The Keychain, readable once the phone has been unlocked after a restart, so a push can be answered from the lock screen. A value
// stays small (one player each: an id, a name and a key), well under the 2 KB a Keychain item is good for
export function secureStoreStorage(secureStore: SecureStoreModule): OnlineStorage {
  const options = secureStore.AFTER_FIRST_UNLOCK === undefined ? undefined : { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK }
  return {
    getItem: (key) => secureStore.getItemAsync(key, options),
    setItem: (key, value) => secureStore.setItemAsync(key, value, options),
    removeItem: (key) => secureStore.deleteItemAsync(key, options)
  }
}

// A browser's localStorage. Clearing the site's data loses the players, and each profile's next match or leaderboard run makes a new one
export function localStorageStorage(): OnlineStorage | null {
  const storage = (globalThis as { localStorage?: Storage }).localStorage
  if (!storage) return null
  return {
    getItem: async (key) => storage.getItem(key),
    setItem: async (key, value) => storage.setItem(key, value),
    removeItem: async (key) => storage.removeItem(key)
  }
}

// Kept only while the app runs: what a phone gets if it hands in no secure store (so a game can try online play before wiring one in)
export function memoryStorage(): OnlineStorage {
  const values = new Map<string, string>()
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => void values.set(key, value),
    removeItem: async (key) => void values.delete(key)
  }
}

// The store a game gets by default: the Keychain when it hands in expo-secure-store, the site's localStorage in a browser, and memory otherwise
export function defaultStorage(secureStore: SecureStoreModule | undefined): OnlineStorage {
  if (secureStore) return secureStoreStorage(secureStore)
  return (Platform.OS === 'web' ? localStorageStorage() : null) ?? memoryStorage()
}
