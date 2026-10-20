# Security

## Reporting

Open a private security advisory at https://github.com/NovusEdge/glowup/security/advisories/new. Do not open a public issue.

You get an acknowledgement within 7 days and a fix or a decision within 90 days. Public disclosure waits for the fix or the 90 days, whichever comes first.

## What Ops Control touches

- **Tool calls and session usage.** Ops Control reads them locally to fill the pane and the activity band. It does not send them anywhere.
- **`git diff --numstat`.** Ops Control runs this in your working directory for the Changes tab. It runs locally and reads only file names and line counts.
- **Theme files from https URLs.** Ops Control can download a theme JSON file. A theme is data only. It is validated before use and never executed.
- **`/ops statusline on`.** This is opt-in. After asking you, it rewrites only the `statusLine` key of your `settings.json`. It changes no other key.

## What counts

- A theme file that makes Ops Control run code, a command, or a process.
- A theme download from a host other than the https URL the user gave, including through a redirect.
- Any write to `settings.json` that happens without asking, or that changes a key other than `statusLine`.
- Session data, tool-call contents, or diff contents leaving the machine.
- A way to make `git diff --numstat` run anywhere other than the user's working directory, or with arguments the user did not choose.

## What does not count

- A theme with ugly or unreadable colors.
- Anything a mod can do by design: mods run with the user's permissions and are not sandboxed.
- A theme URL the user chose to download from a host they do not trust, as long as the file is validated and not executed.
