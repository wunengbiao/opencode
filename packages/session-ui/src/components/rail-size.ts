const pillHeightRest = 5

const pillHeightMin = 4

const pillHeightMax = 6

const pillGapRest = 10

const pillGapMin = 4

/** A rail keeps one tight column: gaps compress to their floor before pill height does. */
export function railPillSize(availableHeight: number, count: number) {
  if (count <= 0 || availableHeight <= 0) return { height: pillHeightRest, gap: pillGapRest }

  const slot = (availableHeight - (count - 1) * pillGapMin) / count

  const height = Math.max(pillHeightMin, Math.min(pillHeightMax, slot))

  const gap =
    count > 1
      ? Math.max(pillGapMin, Math.min(pillGapRest, (availableHeight - count * height) / (count - 1)))
      : pillGapRest

  return { height, gap }
}
