import { Command } from "@tauri-apps/plugin-shell"

export interface DepStatus {
  pandoc: boolean
  zip: boolean
  typst: boolean
}

export async function checkDependencies(): Promise<DepStatus> {
  const check = async (cmd: string, args: string[]): Promise<boolean> => {
    try {
      const result = await Command.create(cmd, args).execute()
      return result.code === 0 || result.stdout.trim().length > 0
    } catch {
      return false
    }
  }

  const [pandoc, zip, typst] = await Promise.all([
    check("pandoc", ["--version"]),
    // On Windows, use "zip" or PowerShell's Compress-Archive; check "zip" first
    check("zip", ["--version"]),
    // Optional: enables compiling pandoc's Typst output to PDF via `typst compile`
    check("typst", ["--version"]),
  ])

  return { pandoc, zip, typst }
}
