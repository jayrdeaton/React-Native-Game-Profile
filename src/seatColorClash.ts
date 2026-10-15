// Seat 2's color, moved off seat 1's when the two resolve to the same color. Each seat's color
// comes from its own source (a selected profile's saved color, or a remembered guest/CPU color, see
// createSeatColorsSlice), and picking a profile has no swap step the way a manual recolor does, so
// a profile saved as the other seat's color would otherwise give both seats the same color. On a
// clash, seat 2 takes seat 1's default color, or seat 2's default when seat 1 is already on its own
// default. Colors compare case-insensitively. The result is for display, not for persisting: call
// it wherever the two seats' colors are resolved, so a guest's or the CPU's remembered color is
// left alone.
export function avoidSeatColorClash(p1Color: string, p2Color: string, defaults: readonly [p1Default: string, p2Default: string]): string {
  if (p2Color.toLowerCase() !== p1Color.toLowerCase()) return p2Color
  const [p1Default, p2Default] = defaults
  return p2Color.toLowerCase() === p1Default.toLowerCase() ? p2Default : p1Default
}
