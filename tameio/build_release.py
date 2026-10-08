#!/usr/bin/env python3
"""Release helper for THEMISTOCLES96-TAMEIO (standard library only).

Interactive flow (default):
    ZIP preview -> build ZIP -> git dry run -> confirm -> git add -> staged preview
    -> commit confirmation -> commit -> select branch -> push confirmation -> push

Options:
    --bump {major,minor,patch}   bump VERSION, js/config.js and service-worker.js
    --changelog                  prepend an entry generated from `git log` to CHANGELOG.md
    --update-sw                  regenerate the service worker pre-cache list
    --zip-only                   only build the ZIP (used by CI)
    --dry-run                    show everything, change nothing in git
    -y, --yes                    answer "yes" to every confirmation
"""
import argparse
import datetime as dt
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT = "THEMISTOCLES96-TAMEIO"
ZIP_FILE = ROOT / f"{PROJECT}.zip"
EXCLUDE_DIRS = {".git", "__pycache__", "node_modules", "dist"}
EXCLUDE_FILES = {".DS_Store", ZIP_FILE.name}
YES = ("y", "yes", "ν", "ναι")
SW_START, SW_END = "// PRECACHE-START", "// PRECACHE-END"


def banner(t):
    print(f"\n{'=' * 40}\n{t}\n{'=' * 40}\n")


def run(cmd, check=True, show=True):
    r = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if show and r.stdout:
        print(r.stdout)
    if show and r.stderr:
        print(r.stderr)
    if check and r.returncode:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}")
    return r


def confirm(question, args, default=False):
    if args.yes:
        return True
    ans = input(f"{question} ({'Y/n' if default else 'y/N'}): ").strip().lower()
    return default if not ans else ans in YES


def project_files():
    out = []
    for p in sorted(ROOT.rglob("*")):
        rel = p.relative_to(ROOT)
        if p.is_file() and not any(part in EXCLUDE_DIRS for part in rel.parts) and p.name not in EXCLUDE_FILES:
            out.append(rel)
    return out


def preview_zip():
    banner("ZIP PREVIEW")
    files = project_files()
    total = 0
    for f in files:
        size = (ROOT / f).stat().st_size
        total += size
        print(f"{size / 1024:9.1f} KB  {f}")
    print(f"\nTotal files: {len(files)}  ({total / 1024 / 1024:.2f} MB uncompressed)")
    return files


def build_zip():
    banner("BUILD ZIP")
    with zipfile.ZipFile(ZIP_FILE, "w", zipfile.ZIP_DEFLATED) as z:
        for f in project_files():
            z.write(ROOT / f, f"{PROJECT}/{f.as_posix()}")
    print(f"ZIP created: {ZIP_FILE.name} ({ZIP_FILE.stat().st_size / 1024 / 1024:.2f} MB)")


# ------------------------------------------------------------------ versioning
def current_version():
    return (ROOT / "VERSION").read_text().strip()


def bump(kind):
    major, minor, patch = map(int, current_version().split("."))
    major, minor, patch = {"major": (major + 1, 0, 0), "minor": (major, minor + 1, 0), "patch": (major, minor, patch + 1)}[kind]
    new = f"{major}.{minor}.{patch}"
    (ROOT / "VERSION").write_text(new + "\n")
    for rel, pat, rep in (("js/config.js", r"(version: ')[\d.]+(')", rf"\g<1>{new}\g<2>"),
                          ("service-worker.js", r"(const VERSION = ')[\d.]+(')", rf"\g<1>{new}\g<2>")):
        p = ROOT / rel
        p.write_text(re.sub(pat, rep, p.read_text(encoding="utf-8")), encoding="utf-8")
    print(f"Version bumped to {new}")
    return new


def update_sw():
    """Regenerate the service worker pre-cache list from the files on disk."""
    skip = {"README.md", "CHANGELOG.md", "LICENSE", "VERSION", "build_release.py", "service-worker.js"}
    skip_dirs = {"tools", ".github", "sample-data", "screenshots"}
    urls = ["./"]
    for f in project_files():
        if f.name in skip or f.name.startswith(".") or f.suffix in (".zip", ".txt", ".py", ".yml") or skip_dirs & set(f.parts):
            continue
        urls.append(f.as_posix())
    block = f"{SW_START}\nconst PRECACHE = [\n" + ",\n".join(f"  '{u}'" for u in urls) + f"\n];\n{SW_END}"
    p = ROOT / "service-worker.js"
    s = p.read_text(encoding="utf-8")
    s = re.sub(re.escape(SW_START) + r".*?" + re.escape(SW_END), lambda _: block, s, flags=re.S)
    p.write_text(s, encoding="utf-8")
    print(f"Service worker pre-cache list updated ({len(urls)} entries)")


def changelog():
    r = run(["git", "log", "--pretty=format:- %s (%h)", "-n", "30", "--", "."], check=False, show=False)
    entry = f"\n## {current_version()} — {dt.date.today()}\n{r.stdout.strip() or '- (no commits)'}\n"
    p = ROOT / "CHANGELOG.md"
    s = p.read_text(encoding="utf-8")
    head, _, rest = s.partition("\n## ")
    p.write_text(head.rstrip() + "\n" + entry + ("\n## " + rest if rest else ""), encoding="utf-8")
    print("CHANGELOG.md updated")


# ------------------------------------------------------------------------ git
def git_dry_run(args):
    banner("GIT DRY RUN")
    print("Git status:\n")
    run(["git", "status", "--short", "."], check=False)
    print("\nGit diff --stat:\n")
    run(["git", "diff", "--stat", "."], check=False)
    return confirm("Continue?", args)


def git_flow(args):
    if run(["git", "rev-parse", "--is-inside-work-tree"], check=False, show=False).returncode:
        print("Not a git repository - skipping git steps.")
        return
    if not git_dry_run(args) or args.dry_run:
        print("Stopping before any git change." if args.dry_run else "Cancelled.")
        return
    banner("GIT ADD")
    run(["git", "add", "."])
    banner("STAGED PREVIEW")
    run(["git", "diff", "--cached", "--stat", "."], check=False)
    if not confirm("Create commit?", args):
        print("Commit cancelled.")
        return
    msg = f"Release {current_version()} ({dt.datetime.now():%Y-%m-%d %H:%M:%S})"
    print(f"Commit message: {msg}")
    r = run(["git", "commit", "-m", msg], check=False)
    if "nothing to commit" in (r.stdout + r.stderr).lower():
        print("No changes to commit.")
    elif r.returncode:
        raise RuntimeError("Commit failed")
    banner("BRANCHES")
    current = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], show=False).stdout.strip()
    branches = [b for b in run(["git", "branch", "--format=%(refname:short)"], check=False, show=False).stdout.split() if b] or [current]
    for i, b in enumerate(branches, 1):
        print(f"{i}. {b}{'  (current)' if b == current else ''}")
    choice = current
    if not args.yes:
        sel = input(f"\nSelect branch [Enter = {current}]: ").strip()
        if sel.isdigit() and 1 <= int(sel) <= len(branches):
            choice = branches[int(sel) - 1]
        elif sel:
            choice = sel
    if choice != current:
        run(["git", "checkout", choice])
    if confirm(f"Push to origin/{choice}?", args):
        banner("PUSH")
        run(["git", "push", "-u", "origin", choice])
    else:
        print("Push cancelled.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bump", choices=["major", "minor", "patch"])
    ap.add_argument("--changelog", action="store_true")
    ap.add_argument("--update-sw", action="store_true")
    ap.add_argument("--zip-only", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("-y", "--yes", action="store_true")
    args = ap.parse_args()
    try:
        if args.bump and not args.dry_run:
            bump(args.bump)
        if args.update_sw or args.bump:
            update_sw()
        if args.changelog:
            changelog()
        preview_zip()
        build_zip()
        if not args.zip_only:
            git_flow(args)
        print("\nDone.")
    except (RuntimeError, KeyboardInterrupt) as e:
        print(f"\nAborted: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
