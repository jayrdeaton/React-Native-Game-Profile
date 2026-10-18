import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { type ProfileSwatchPlace, type ProfileSwatchRenderer } from './ProfileColorContext'

interface Props {
  // The circle's diameter: the swatch's own size, less any ring drawn inside it.
  size: number
  // What the renderer drew (see drawSwatch).
  children: ReactNode
}

// What a ProfileColorProvider `renderSwatch` draws for one swatch, or null for the flat fill: there's
// no renderer, or it returned null or undefined for this place.
export function drawSwatch(render: ProfileSwatchRenderer | undefined, color: string, size: number, place: ProfileSwatchPlace): ReactNode {
  return render ? (render(color, size, place) ?? null) : null
}

// A ProfileColorProvider `renderSwatch` drawing in place of a swatch's flat fill: absolutely placed at
// the swatch's top left (inside any border), behind the mark drawn after it, and clipped to the circle
// so a square drawing still reads as the round swatch. Not exported from index.ts.
export function SwatchLayer({ size, children }: Props) {
  return <View style={[styles.layer, { borderRadius: size / 2, height: size, width: size }]}>{children}</View>
}

const styles = StyleSheet.create({
  layer: {
    left: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'absolute',
    top: 0
  }
})
