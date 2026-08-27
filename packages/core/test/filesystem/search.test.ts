import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect, Layer } from "effect"
// loaded for evaluation order: the filesystem and filesystem/search module bodies are mutually
// cyclic, so this module must initialize before the search import below
import "@opencode-ai/core/filesystem"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FileSystemSearch } from "@opencode-ai/core/filesystem/search"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Location } from "@opencode-ai/core/location"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { AbsolutePath, RelativePath } from "@opencode-ai/core/schema"
import { location } from "../fixture/location"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(Ripgrep.node))

const withTmp = <A, E, R>(f: (directory: AbsolutePath) => Effect.Effect<A, E, R>) =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(Effect.flatMap((tmp) => f(AbsolutePath.make(tmp.path))))

const poll = <A, E, R>(effect: Effect.Effect<A, E, R>, ready: (result: A) => boolean, timeoutMs = 10_000) =>
  Effect.gen(function* () {
    const deadline = Date.now() + timeoutMs
    let result = yield* effect
    while (!ready(result) && Date.now() < deadline) {
      yield* Effect.sleep(50)
      result = yield* effect
    }
    return result
  })

describe("Ripgrep", () => {
  it.live("globs files as an array", () =>
    withTmp((cwd) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => fs.mkdir(path.join(cwd, "src")))
        yield* Effect.promise(() => fs.writeFile(path.join(cwd, "src", "match.ts"), "needle\n"))
        const result = yield* (yield* Ripgrep.Service).glob({ cwd, pattern: "**/*.ts", limit: 10 })
        expect(result.map((item) => item.path)).toEqual([RelativePath.make("src/match.ts")])
      }),
    ),
  )

  it.live("greps files with include filtering", () =>
    withTmp((cwd) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => fs.mkdir(path.join(cwd, "src")))
        yield* Effect.promise(() => fs.writeFile(path.join(cwd, "src", "match.ts"), "needle\n"))
        yield* Effect.promise(() => fs.writeFile(path.join(cwd, "src", "skip.txt"), "needle\n"))
        const result = yield* (yield* Ripgrep.Service).grep({ cwd, pattern: "needle", include: "*.ts", limit: 10 })
        expect(result).toHaveLength(1)
        expect(result[0]?.entry.path).toBe(RelativePath.make("src/match.ts"))
        expect(result[0]?.submatches[0]?.text).toBe("needle")
      }),
    ),
  )
})

describe("FileSystemSearch", () => {
  it.live(
    "find returns fresh results after the rescan interval",
    () =>
      withTmp((directory) =>
        Effect.gen(function* () {
          const search = yield* FileSystemSearch.Service
          const findFiles = (query: string) => search.find({ query, limit: 10, type: "file" })

          yield* Effect.promise(() => fs.writeFile(path.join(directory, "alpha.txt"), "alpha"))
          const initial = yield* poll(findFiles("alpha"), (result) => result.length > 0)
          expect(initial.map((entry) => entry.path)).toEqual([RelativePath.make("alpha.txt")])

          yield* Effect.promise(() => fs.writeFile(path.join(directory, "beta.txt"), "beta"))
          yield* Effect.promise(() => fs.rm(path.join(directory, "alpha.txt")))
          // the snapshot is still served within the rescan interval
          expect((yield* findFiles("alpha")).map((entry) => entry.path)).toEqual([RelativePath.make("alpha.txt")])

          yield* Effect.sleep(5_500)
          // find triggers the background rescan; poll until the refreshed index lands
          const refreshed = yield* poll(findFiles("beta"), (result) => result.length > 0)
          expect(refreshed.map((entry) => entry.path)).toEqual([RelativePath.make("beta.txt")])
          expect(yield* findFiles("alpha")).toEqual([])
        }).pipe(
          Effect.provide(
            Layer.provideMerge(
              FileSystemSearch.ripgrepLayer,
              Layer.mergeAll(
                LayerNode.compile(FSUtil.node),
                Layer.succeed(Location.Service, Location.Service.of(location({ directory }))),
              ),
            ),
          ),
        ),
      ),
    30_000,
  )
})
