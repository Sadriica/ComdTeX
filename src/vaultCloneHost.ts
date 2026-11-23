// The Tauri side of "Open from Git": spawns git and calls the three Rust
// commands that prepare, finish and discard the scratch folder (the webview's
// fs scope does not reach the folders a clone is made in).
import { invoke } from "@tauri-apps/api/core"
import { Command } from "@tauri-apps/plugin-shell"
import type { CloneHost } from "./vaultClone"

export const tauriCloneHost: CloneHost = {
  async spawn(args, env, { onStderr, onClose }) {
    // processGroup: killing the clone also stops git's helper (ssh, remote-https).
    const cmd = Command.create("git", args, { env, processGroup: true })
    cmd.stderr.on("data", onStderr)
    cmd.on("close", ({ code }) => onClose(code))
    cmd.on("error", (e) => {
      onStderr(String(e))
      onClose(null)
    })
    const child = await cmd.spawn()
    return { kill: () => child.kill() }
  },
  prepare: (parent, name) => invoke("prepare_clone_dest", { parent, name }),
  finish: (temp, dest) => invoke("finish_clone", { temp, dest }),
  discard: (temp) => invoke("discard_clone", { temp }),
}
