import { describe, expect, test } from "bun:test"
import { railPillSize } from "./rail-size"

describe("railPillSize", () => {
  test("rests at 5px with a 10px gap before the rail is measured", () => {
    expect(railPillSize(0, 3)).toEqual({ height: 5, gap: 10 })
    expect(railPillSize(0, 0)).toEqual({ height: 5, gap: 10 })
  })

  test("compresses the gap before the pill height", () => {
    expect(railPillSize(96, 10)).toEqual({ height: 6, gap: 4 })
    expect(railPillSize(60, 4)).toEqual({ height: 6, gap: 10 })
  })

  test("floors pill height and gap at 4px when the rail overflows", () => {
    expect(railPillSize(72, 10)).toEqual({ height: 4, gap: 4 })
  })

  test("keeps one pill at its tallest and the resting gap", () => {
    expect(railPillSize(100, 1)).toEqual({ height: 6, gap: 10 })
  })
})
