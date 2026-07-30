/**
 * Reads and writes `.comdtex-folder.json`, the per-folder rules file.
 *
 * Everything here is on-demand: rules are consulted when a file is created or a
 * folder is regenerated, never while typing. The parsed results are cached per
 * directory and invalidated by mtime, so repeatedly creating notes in the same
 * folder does not re-read the config each time.
 *
 * `.comdtex-folder.json` starts with a dot, so `buildTree` already hides it from
 * the file tree and from vault search — it cannot be discovered by walking the
 * tree, which is why lookups probe the ancestor chain directly.
 */
import { useCallback, useRef } from "react"
import { exists, readTextFile, stat } from "@tauri-apps/plugin-fs"
import {
  FOLDER_RULES_FILENAME,
  parseFolderRules,
  serializeFolderRules,
  resolveRulesForDir,
  ancestorChain,
  type FolderRules,
} from "./folderRules"
import { writeTextFileAtomic } from "./atomicWrite"
import { pathJoin } from "./pathUtils"

interface CacheEntry {
  mtimeMs: number
  rules: FolderRules | null
}

export interface FolderRulesApi {
  /** Rules in effect for `dirPath`, merged down the ancestor chain. */
  resolve: (dirPath: string) => Promise<FolderRules | null>
  /** Only the rules `dirPath` itself declares — what the editor modal shows. */
  readOwn: (dirPath: string) => Promise<FolderRules | null>
  /** Write `dirPath`'s own rules. Passing null removes nothing; it writes an empty config. */
  write: (dirPath: string, rules: FolderRules) => Promise<void>
  /** Drop cached rules (after an external edit to the config file). */
  invalidate: (dirPath?: string) => void
}

export function useFolderRules(vaultPath: string | null): FolderRulesApi {
  const cache = useRef(new Map<string, CacheEntry>())

  /** Read + parse one folder's config, reusing the cache while mtime is unchanged. */
  const readDir = useCallback(async (dirPath: string): Promise<FolderRules | null> => {
    const configPath = await pathJoin(dirPath, FOLDER_RULES_FILENAME)
    let mtimeMs = 0
    try {
      if (!(await exists(configPath))) {
        cache.current.delete(dirPath)
        return null
      }
      mtimeMs = (await stat(configPath)).mtime?.getTime() ?? 0
    } catch {
      return null
    }

    const cached = cache.current.get(dirPath)
    if (cached && cached.mtimeMs === mtimeMs) return cached.rules

    try {
      const rules = parseFolderRules(await readTextFile(configPath))
      cache.current.set(dirPath, { mtimeMs, rules })
      return rules
    } catch {
      return null
    }
  }, [])

  const resolve = useCallback(async (dirPath: string): Promise<FolderRules | null> => {
    if (!vaultPath) return null
    const chain = ancestorChain(dirPath, vaultPath)
    const byDir = new Map<string, FolderRules>()
    // Sequential rather than parallel: the chain is a handful of directories and
    // most of them have no config, so the exists() checks are cheap.
    for (const dir of chain) {
      const rules = await readDir(dir)
      if (rules) byDir.set(dir, rules)
    }
    return resolveRulesForDir(byDir, dirPath, vaultPath)
  }, [vaultPath, readDir])

  const readOwn = useCallback((dirPath: string) => readDir(dirPath), [readDir])

  const write = useCallback(async (dirPath: string, rules: FolderRules) => {
    const configPath = await pathJoin(dirPath, FOLDER_RULES_FILENAME)
    await writeTextFileAtomic(configPath, serializeFolderRules(rules))
    cache.current.delete(dirPath)
  }, [])

  const invalidate = useCallback((dirPath?: string) => {
    if (dirPath) cache.current.delete(dirPath)
    else cache.current.clear()
  }, [])

  return { resolve, readOwn, write, invalidate }
}
