export function formatBhd(n: number): string {
  const v = typeof n === 'number' ? n : 0
  return `${v.toFixed(3)} BHD`
}
