"""Repeated release APK launch and frame budgets on a fixed emulator fixture."""
import argparse
import json
import pathlib
import re
import statistics
import subprocess
import time

PACKAGE = "com.pravah.mobile.e2e"
BASELINE = json.loads(pathlib.Path(__file__).with_name("native-baseline.json").read_text())


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
              "baselineFrameP95Ms": BASELINE["frameP95Ms"],
              "frameP95BudgetMs": BASELINE["frameP95Ms"] * BASELINE["maximumRegressionRatio"],
              "targetFrameP95Ms": BASELINE["targetFrameP95Ms"],
              "method": "Android gfxinfo window frames during fixed ADB swipes after Maestro exits; not Perfetto attribution"}
    result["frameP95RegressionPercent"] = (result["frameP95Ms"] / BASELINE["frameP95Ms"] - 1) * 100
    result["meetsTarget"] = result["frameP95Ms"] <= BASELINE["targetFrameP95Ms"]
    (out / "frames.json").write_text(json.dumps(result, indent=2))
    if result["frameP95Ms"] > result["frameP95BudgetMs"]:
        raise RuntimeError(f"Native frame budget exceeded: {result}")
    (out / "memory.txt").write_text(adb("shell", "dumpsys", "meminfo", PACKAGE))


def scroll(out):
    # Maestro verifies navigation and scrolling separately. Its UI hierarchy
    # inspections and screenshots must not run alongside the timed gestures.
    (out / "maestro-framestats.txt").write_text(
        adb("shell", "dumpsys", "gfxinfo", PACKAGE, "framestats"))
    sizes = re.findall(r"(\d+)x(\d+)", adb("shell", "wm", "size"))
    if not sizes:
        raise RuntimeError("Cannot determine emulator display size")
    width, height = map(int, sizes[-1])
    densities = re.findall(r"\d+", adb("shell", "wm", "density"))
    api_level = int(adb("shell", "getprop", "ro.build.version.sdk").strip())
    if (width, height, int(densities[-1]), api_level) != (
        BASELINE["displayWidth"], BASELINE["displayHeight"],
        BASELINE["displayDensity"], BASELINE["apiLevel"],
    ):
        raise RuntimeError("Display/API configuration does not match the native baseline")
    x, top, bottom = width // 2, int(height * .32), int(height * .76)
    protocol = {"displayWidth": width, "displayHeight": height, "swipes": 12,
                "durationMs": 600, "directions": "six up, six down",
                "settleBetweenSwipesMs": 100}
    (out / "scroll-protocol.json").write_text(json.dumps(protocol, indent=2))
    adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset")
    for iteration in range(12):
        start, end = (bottom, top) if iteration < 6 else (top, bottom)
        adb("shell", "input", "swipe", str(x), str(start), str(x), str(end), "600")
        time.sleep(.1)
    frames(out)


parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=["startup", "scroll"])
parser.add_argument("--out", default="artifacts/mobile-native")
args = parser.parse_args()
output = pathlib.Path(args.out)
output.mkdir(parents=True, exist_ok=True)
measure(output) if args.mode == "startup" else scroll(output)
