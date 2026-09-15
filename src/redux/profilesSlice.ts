import { Profile } from '../types'
import { createActionCreator } from './createActionCreator'

export interface UpdateProfilePayload {
  id: string
  patch: Partial<Pick<Profile, 'name' | 'color' | 'tag'>>
}

// setAll: full-replace, for hydrating from resolveInitialProfiles or a remote refresh
// (useSharedProfilesSync's onRemoteChange). add/update/remove: the actual roster CRUD every
// @tastic game already hand-rolled an identical version of in its own useProfiles.tsx.
const setAll = createActionCreator<Profile[]>('profiles/setAll')
const add = createActionCreator<Profile>('profiles/add')
const update = createActionCreator<UpdateProfilePayload>('profiles/update')
const remove = createActionCreator<string>('profiles/remove')

export const profilesActions = { add, remove, setAll, update }

export function profilesReducer(state: Profile[] = [], action: { type: string }): Profile[] {
  if (setAll.match(action)) return action.payload
  if (add.match(action)) return [...state, action.payload]
  if (update.match(action)) {
    const { id, patch } = action.payload
    return state.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p))
  }
  if (remove.match(action)) return state.filter((p) => p.id !== action.payload)
  return state
}

function generateProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export interface CreateProfileInput {
  name: string
  color: string
  tag: string
}

// Builds a complete Profile (id + timestamps) ready to dispatch via profilesActions.add. Kept as
// its own plain function rather than folded into the `add` action creator, so `add` itself stays a
// simple "append this exact record" primitive (useful for rehydration/tests too, where the record
// already exists and shouldn't get a second, different id/timestamp minted for it).
export function createProfileRecord(input: CreateProfileInput): Profile {
  const now = Date.now()
  return { color: input.color, createdAt: now, id: generateProfileId(), name: input.name, tag: input.tag, updatedAt: now }
}
