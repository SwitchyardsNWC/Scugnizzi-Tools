# Social icons for email footers

The footer's "Social icons instead of names" option draws these. The site publishes this folder, so each file is
reachable at a public address, and that address is what a sent email asks for:

    https://switchyardsnwc.github.io/Scugnizzi-Tools/email-assets/social/<file>

**Do not move, rename or delete anything in this folder.** Every email that has already gone out keeps asking for
these files by these exact names, forever. An icon moved today goes blank in last month's newsletter. To change an
icon, add a new file under a new name, and point the tools at it in `template-studio/src/model/social-icons.ts`.

| File | For |
|---|---|
| `*-offwhite.png` | dark footers: the masthead, the ledger, the stub. The house off-white, `#f7f6f3`. |
| `*-navy.png` | light footers: the letterhead on cream. The house navy, `#011272`. |

Which one a footer uses is decided by its text colour, so a footer set on a light band gets the navy set without
anybody choosing. The artwork is Jared's, 2026-09-29; only the colour was set and the size taken down to four times
the 20px they are drawn at.

They need to be on `main` before an email that uses them is sent, because `main` is what the site publishes. Until
then Template Studio shows them from your own copy, so the canvas is not a reason to think they are live.
