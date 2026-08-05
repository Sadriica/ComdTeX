# Writing with someone else

ComdTeX can keep a vault in sync between coauthors without a cloud service of its own: the shared copy lives in a Git repository you control (GitHub, GitLab, or any Git host). The Git panel's **"Write with someone else"** section drives the whole flow in plain language; you never need to know Git to use it.

## Sharing a vault (once)

1. Open the Git panel (the branch button in the top bar). If the vault has no repository yet, initialize it from the panel.
2. In **Write with someone else**, click **Create repository on GitHub**. Create it *private* and empty (no README).
3. Copy the repository address (the `https://…` or `git@…` one) and paste it into the box; click **Connect**. Your vault is uploaded and becomes the shared copy.
4. Invite your coauthor from the repository's settings (Collaborators). They clone it once and open the folder as a vault in ComdTeX.

## Day to day

The section always shows one sentence describing where you stand, and one or two buttons:

| It says | It means | What to press |
|---|---|---|
| You have work not yet saved to the history | You wrote things since the last save point | **Save and send** (the message is optional; an honest dated one is used if empty) |
| There are N new changes from your coauthor | They sent work you do not have yet | **Bring changes** |
| You have N saved changes waiting to be sent | Your save points have not reached the shared copy | **Send changes** |
| Everything level with the shared copy | Nothing to do | Nothing |

If you try to send and your coauthor got there first, ComdTeX tells you to bring their changes first, then send again. Nothing is ever lost in that exchange.

## When you both edited the same lines

Bringing changes can stop on a *conflict*: the same lines changed on both sides, and no program should decide silently which version of a paragraph survives. The section lists each conflicted file with two buttons:

- **Keep mine**: your version of that file stays.
- **Use theirs**: your coauthor's version stays.

For a mixed outcome, open the file in the editor instead: the conflicting regions are marked between `<<<<<<<`, `=======` and `>>>>>>>` lines; keep what you want, delete the markers, and save. When every file is settled, press **Finish the merge**, then send.

## Notes

- The advanced sections of the Git panel (branches, staging, stash, remotes) remain available; the guided section is a layer, not a replacement.
- Works with any Git host, not only GitHub; the create button simply opens GitHub because it is where most coauthors already are.
- Private repository + Git history means your drafts stay yours, versioned, and off anyone's servers except the host you chose. This is the same local-first stance as the rest of ComdTeX.
