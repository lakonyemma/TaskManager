// Deterministic, GitHub-style identicon — every user gets a picture-like
// avatar derived purely from their id, with no upload/URL step and no
// storage. Same input always produces the same output, so it's stable
// across sessions and devices without needing a database field.

const hashString = (str: string): number => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

const GRID = 5
const CELL = 40 // px per cell in the 200x200 viewBox

export const generateIdenticon = (seed: string): string => {
  const hash = hashString(seed || 'taskly')
  const hue = Math.abs(hash) % 360
  const fg = `hsl(${hue}, 65%, 55%)`
  const bg = `hsl(${hue}, 45%, 16%)`

  const bits = Math.abs(hash)
  const cells: string[] = []
  // Only columns 0..2 are driven by the hash; columns 3/4 mirror 1/0 so the
  // pattern is left-right symmetric (the classic identicon look).
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < 3; col++) {
      const on = (bits >> (row * 3 + col)) & 1
      if (!on) continue
      cells.push(`<rect x="${col * CELL}" y="${row * CELL}" width="${CELL}" height="${CELL}"/>`)
      if (col < 2) {
        const mirrorCol = GRID - 1 - col
        cells.push(`<rect x="${mirrorCol * CELL}" y="${row * CELL}" width="${CELL}" height="${CELL}"/>`)
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${bg}"/><g fill="${fg}">${cells.join('')}</g></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
