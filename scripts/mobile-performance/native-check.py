"""Repeated release APK launch and frame budgets on a fixed emulator fixture."""
import argparse
import json
import pathlib
import statistics
import subprocess
import time

PACKAGE = "com.pravah.mobile.e2e"


def adb(*args):
    return subprocess.check_output(["adb", *args], text=True)


def measure(out):
    starts = []
    for iteration in range(5):
        adb("shell", "am", "force-stop", PACKAGE)
        began = time.monotonic()
        launch = adb("shell", "am", "start", "-W", "-n", f"{PACKAGE}/.MainActivity")
        (out / f"launch-{iteration}.txt").write_text(launch)
        # Only the current app PID's log window is examined. Do not count a
        # previous launch's interactive marker as this launch's readiness.
        pid = adb("shell", "pidof", PACKAGE).strip()
        while time.monotonic() - began < 30:
            logs = adb("logcat", "-d", "--pid", pid, "-v", "epoch")
            if "app_interactive_ready" in logs:
                starts.append(round((time.monotonic() - began) * 1000))
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("App did not report interactive within 30 seconds")
        time.sleep(1)
    result = {"coldInteractiveMs": starts, "coldInteractiveMedianMs": statistics.median(starts),
              "coldInteractiveMaxMs": max(starts), "fixtureTasks": 500,
              "method": "host-observed release app log marker; includes ADB polling overhead"}
    (out / "startup.json").write_text(json.dumps(result, indent=2))
    if result["coldInteractiveMedianMs"] > 8000 or result["coldInteractiveMaxMs"] > 15000:
        raise RuntimeError(f"Native startup budget exceeded: {result}")


def frames(out):
    raw = adb("shell", "dumpsys", "gfxinfo", PACKAGE, "framestats")
    (out / "framestats.txt").write_text(raw)
    durations = []
    header = None
    for line in raw.splitlines():
        fields = line.strip().split(",")
        if "IntendedVsync" in fields and "FrameCompleted" in fields:
            header = fields
        elif header and fields and fields[0].isdigit() and len(fields) >= len(header):
            row = dict(zip(header, fields))
            if row.get("Flags") != "0":
                continue
            start, end = int(row["IntendedVsync"]), int(row["FrameCompleted"])
            if end > start > 0 and end < 9_000_000_000_000_000_000:
                durations.append((end - start) / 1_000_000)
    if len(durations) < 20:
        raise RuntimeError(f"Insufficient native frames: {len(durations)}")
    ordered = sorted(durations)
    result = {"sampledFrames": len(ordered), "frameMedianMs": statistics.median(ordered),
              "frameP95Ms": ordered[int((len(ordered) - 1) * .95)],
              "framesOver100Ms": sum(value > 100 for value in ordered),
              "method": "Android gfxinfo window frames on fixed CI emulator; not Perfetto attribution"}
    (out / "frames.json").write_text(json.dumps(result, indent=2))
    if result["frameP95Ms"] > 100:
        raise RuntimeError(f"Native frame budget exceeded: {result}")
    (out / "memory.txt").write_text(adb("shell", "dumpsys", "meminfo", PACKAGE))


parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=["startup", "frames"])
parser.add_argument("--out", default="artifacts/mobile-native")
args = parser.parse_args()
output = pathlib.Path(args.out)
output.mkdir(parents=True, exist_ok=True)
measure(output) if args.mode == "startup" else frames(output)
