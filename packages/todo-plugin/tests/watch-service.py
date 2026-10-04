#!/usr/bin/env python3
"""Exercise the bundled unit's sandbox and runtime lifecycle on the real user bus.

Uses an isolated runtime directory and a synthetic writer; no credentials/network.
Run with: python3 packages/todo-plugin/tests/watch-service.py
"""
import configparser
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid


def run(*argv):
    return subprocess.run(argv, check=True, capture_output=True, text=True)


unit = configparser.ConfigParser(interpolation=None)
unit.optionxform = str
unit.read(Path(__file__).parents[1] / "omarchy-plugin/pravah-watch.service")
name = f"pravah-watch-test-{uuid.uuid4().hex}"
runtime = Path(os.environ["XDG_RUNTIME_DIR"]) / name
properties = []
for key, value in unit["Service"].items():
    if key == "ExecStart":
        continue
    if key == "RuntimeDirectory":
        value = name
    elif key == "ReadWritePaths":
        value = value.replace("%t/pravah", str(runtime))
    properties += ["--property", f"{key}={value}"]

with tempfile.TemporaryDirectory(prefix="pravah-service-test-", dir=os.environ["XDG_RUNTIME_DIR"]) as temp:
    writer = Path(temp) / "writer.sh"
    writer.write_text('set -eu\nprintf "{}\\n" > "$XDG_RUNTIME_DIR/' + name + '/snapshot.json"\nexec /usr/bin/sleep infinity\n')
    try:
        run("systemd-run", "--user", f"--unit={name}", *properties, "/bin/sh", str(writer))
        deadline = time.monotonic() + 5
        while not (runtime / "snapshot.json").exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert (runtime / "snapshot.json").read_text() == "{}\n", "sandboxed writer could not publish"
        assert runtime.stat().st_mode & 0o777 == 0o700, "runtime directory is not private"
        sentinel = runtime / "preserved"
        sentinel.write_text("last-good-snapshot")
        run("systemctl", "--user", "restart", name)
        assert sentinel.read_text() == "last-good-snapshot", "restart discarded cached snapshot"
        run("systemctl", "--user", "stop", name)
        assert not runtime.exists(), "stop did not clean up runtime directory"
        print("PRAVAH_SERVICE passed=4 failed=0")
    except Exception:
        print(subprocess.run(["journalctl", "--user", "-u", name, "-n", "12", "--no-pager"], capture_output=True, text=True).stdout)
        raise
    finally:
        subprocess.run(["systemctl", "--user", "stop", name], capture_output=True)
        subprocess.run(["systemctl", "--user", "reset-failed", name], capture_output=True)
