---
name: clamav
repo: remorses/skills
description: >
  Scan downloaded files on macOS with ClamAV before previewing, parsing,
  playing, extracting, or executing them. Use for antivirus checks, malware
  scanning, untrusted downloads, torrents, and scan-before-ffmpeg workflows.
---

# ClamAV

Use **ClamAV**, the open-source Cisco Talos scanner, for local CLI checks.
No scanner can certify a file as safe. A negative result is evidence only.

## Read first

```bash
clamscan --help
freshclam --help
```

Canonical documentation:
- https://raw.githubusercontent.com/Cisco-Talos/clamav-documentation/main/src/manual/Usage/Scanning.md
- https://raw.githubusercontent.com/Cisco-Talos/clamav-documentation/main/src/manual/Usage/SignatureManagement.md
- https://github.com/Cisco-Talos/clamav

## Install and update

Use Homebrew's official formula. No sudo, GUI, or daemon is needed.
If installed already, check the version and update an outdated engine.

```bash
brew install clamav
clamscan --version
```

Keep signatures in a user-owned directory. Create the following config only
if absent; inspect existing config rather than overwriting it.

```bash
db="$HOME/Library/Application Support/ClamAV/db"
config="$HOME/Library/Application Support/ClamAV/freshclam.conf"
mkdir -p "$db"
test -e "$config" || printf 'DatabaseDirectory %s\nDatabaseMirror database.clamav.net\n' "$db" > "$config"
freshclam --config-file="$config" --cvdcertsdir="$(brew --prefix)/etc/clamav/certs"
```

Without `--cvdcertsdir`, Homebrew's freshclam can print `NULL X509 store`
errors. Treat any update or certificate error as a failed update, even with
exit code 0. Never disable TLS or signature checks. Respect CDN cooldowns.

Optionally verify each `.cvd` against its detached `.sign` file:

```bash
for database in "$db/"*.cvd; do
  sigtool --cvdcertsdir="$(brew --prefix)/etc/clamav/certs" --verify "$database" || exit 1
done
```

Incremental updates can produce `.cld` files; this loop does not cover them.

## Scan before use

1. Finish downloading into a fresh private directory outside Photos and other
   watched libraries. Do not preview, use Quick Look, mount, unpack, play, or
   run ffprobe/ffmpeg first. Scanning itself must read and parse the file.
2. Stop the downloader so it cannot change bytes during the scan. Inventory
   paths and sizes with `find` and `stat`; reject symlinks and unexpected files.
3. Record SHA-256, engine version, signature versions, scan flags, exit code,
   and full output. Keep evidence outside the download directory.
4. Scan **all** downloaded files, including sidecars and metadata. Never run
   scripts, installers, codec packs, or executables delivered with media.

```bash
target='/absolute/path/to/private-download-directory'
report='/absolute/path/outside-downloads/scan.log'
clamscan --database="$db" \
  --cvdcertsdir="$(brew --prefix)/etc/clamav/certs" \
  --recursive --follow-dir-symlinks=0 --follow-file-symlinks=0 \
  --alert-exceeds-max=yes --alert-encrypted=yes \
  --log="$report" -- "$target"
scan_exit=$?
printf 'ClamAV exit code: %s\n' "$scan_exit"
```

Interpret the original **scanner** exit code, not a subsequent command or pipe:

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | No detection in scanned material | Review coverage and warnings |
| 1 | Detection or heuristic alert | Stop; retain evidence; do not open |
| 2 | Operational error | Stop; scan is incomplete |

Never use `--remove`, automatically move files, or upload private downloads
to VirusTotal or another service without permission. Keep macOS protections on.

## Large files are a separate gate

**Do not call a skipped file clean.** Default size, recursion, and time limits
can leave material unscanned. Inspect full output, sizes, and scanned counts.
`--alert-exceeds-max=yes` makes limit hits visible, but is not proof of coverage.

ClamAV has an approximately **2 GiB per-file ceiling**, documented in its
[configuration sample](https://raw.githubusercontent.com/Cisco-Talos/clamav/clamav-1.5.4/etc/clamd.conf.sample).
Raising `--max-filesize` and `--max-scansize` does not remove that ceiling.
Do not split a movie into chunks and claim a full scan. For larger files, use a
reputable scanner whose documented limits cover the actual size. If unavailable,
report the scan blocker and do not parse the media. User approval is not a scan.

Encrypted files, skipped files, scan errors, and timeouts mean **incomplete**.
For a file under the ceiling but over defaults, raise limits to cover it.
For a ~1 GiB media file, these flags raise limits above its size:

```bash
--max-filesize=1500M --max-scansize=1800M \
--pcre-max-filesize=1500M --max-scantime=300000
```

These are not a preset for archives; keep archive limits bounded.

## After the scan

Recheck the SHA-256 immediately before parsing; if changed, scan again.
Use an updated media tool as an unprivileged user, preferably in an isolated VM
for high-risk input. Antivirus is not a sandbox, and media parsers can have bugs.
Never remove quarantine attributes or bypass Gatekeeper to make a file open.

Report: “No threats detected by ClamAV [version], using [signature versions],
with [coverage and limits]. This does not guarantee safety.”
