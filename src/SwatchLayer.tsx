import { StyleSheet, View } from 'react-native'

import { type ProfileSwatchRenderer } from './ProfileColorContext'

interface Props {
  render: ProfileSwatchRenderer
  // The drawn color, handed to `render` as is.
  color: string
  // The circle's diameter: the swatch's own size, less any ring drawn inside it.
  size: number
}

// A ProfileColorProvider `renderSwatch` drawing in place of a swatch's flat fill: absolutely placed at
// the swatch's top left (inside any border), behind the mark drawn after it, and clipped to the circle
// so a square drawing still reads as the round swatch. Not exported from index.ts.
export function SwatchLayer({ render, color, size }: Props) {
  return <View style={[styles.layer, { borderRadius: size / 2, height: size, width: size }]}>{render(color, size)}</View>
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
