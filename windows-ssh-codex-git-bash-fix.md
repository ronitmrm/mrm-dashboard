# Fix Codex SSH shell errors on Windows

If ChatGPT/Codex reports that SSH authenticated successfully with `publickey`, but then shows errors like:

```text
/usr/bin/bash: -c: line 2: syntax error: unexpected end of file
'[' is not recognized as an internal or external command
```

then the SSH key and network connection are working. The problem is that Windows OpenSSH is starting `cmd.exe`, while Codex is sending Bash commands.

## Configure Git Bash as the OpenSSH login shell

1. Install **Git for Windows** on the Windows work PC, if it is not already installed.
2. Open **PowerShell as Administrator**.
3. Run:

```powershell
New-ItemProperty `
  -Path "HKLM:\SOFTWARE\OpenSSH" `
  -Name DefaultShell `
  -Value "C:\Program Files\Git\bin\bash.exe" `
  -PropertyType String `
  -Force

Restart-Service sshd
```

## Verify Codex is available to SSH sessions

Open Git Bash on the Windows work PC and run:

```bash
command -v codex
codex --version
```

Both commands must succeed. If they do not, install Codex or add it to the PATH used by Git Bash.

## Reconnect

Return to the ChatGPT desktop app on the home Mac:

1. Go to **Settings → Connections → SSH**.
2. Select the work host.
3. Click **Reconnect**.

The SSH key, Tailscale network path, and host configuration are already confirmed working if the earlier error said `Authenticated ... using "publickey"`.
