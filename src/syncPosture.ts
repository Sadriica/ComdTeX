// Where does this vault actually live, and what happens if the laptop dies.
//
// ComdTeX has two mechanisms that both answer "my work in more than one
// place", and they are not equals. Git keeps history: it can say what changed,
// when, and by whom, and it stops on a conflict instead of picking a winner. A
// synced cloud folder keeps a copy: no history, no review, and its idea of a
// conflict is to leave a second file next to the first and hope someone reads
// the name. So git is the mechanism, and cloud detection is a safety net for
// the people who will never use git.
//
// The state below is what the Sync settings and the status hint read, so that
// advice comes from one place instead of each surface inventing its own.

export interface SyncFacts {
  /** The vault folder is a git repository. */
  isRepo: boolean
  /** That repository has somewhere to push to. */
  hasRemote: boolean
  /** The vault sits inside a folder a cloud client keeps synced. */
  inCloud: boolean
}

export type SyncPosture =
  /** Versioned and shared: the strong case. */
  | "git-shared"
  /** Versioned, but the history exists only on this machine. */
  | "git-local"
  /** A git repository inside a cloud-synced folder. Actively dangerous. */
  | "git-in-cloud"
  /** Copies travel, nothing is versioned. */
  | "cloud-only"
  /** Nothing leaves this disk. */
  | "local-only"

/**
 * A git repository inside a synced cloud folder is the one combination worth
 * warning about. Two clients then write `.git` at once: the cloud client
 * uploads loose objects, packs and refs in whatever order it finishes them,
 * and a machine that pulls a half-uploaded state gets a repository that git
 * itself reports as corrupt. It is silent until the day it is not, which is
 * why it is a warning and not a preference.
 */
export function syncPosture(facts: SyncFacts): SyncPosture {
  if (facts.isRepo && facts.inCloud) return "git-in-cloud"
  if (facts.isRepo) return facts.hasRemote ? "git-shared" : "git-local"
  return facts.inCloud ? "cloud-only" : "local-only"
}

/** True when the posture is one the user should act on. */
export function needsAttention(posture: SyncPosture): boolean {
  return posture === "git-in-cloud" || posture === "local-only"
}

/** The single next step, or null when the posture is already sound. */
export function nextStep(posture: SyncPosture): "move-out-of-cloud" | "add-remote" | "start-git" | null {
  switch (posture) {
    case "git-in-cloud": return "move-out-of-cloud"
    case "git-local": return "add-remote"
    case "cloud-only":
    case "local-only": return "start-git"
    case "git-shared": return null
  }
}
