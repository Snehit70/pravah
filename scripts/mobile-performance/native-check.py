"""Repeated release APK launch and frame budgets on a fixed emulator fixture."""
import argparse
import json
import pathlib
import re
import statistics
import subprocess
import time

PACKAGE = "com.pravah.mobile.e2e"
ACTIVITY = f"{PACKAGE}/.MainActivity"
# A stock app on the same emulator. Its cold start tracks runner speed without
# depending on Pravah code, so one is recorded before every Pravah launch.
CONTROL_ACTIVITY = "com.android.settings/.Settings"
MARKER = "app_interactive_ready"
# Launch 0 is a declared warm-up: it was the slowest launch in 15 of 23 runs.
# It is still recorded and still held to the per-launch ceiling.
WARMUP_LAUNCHES = 1
MEASURED_LAUNCHES = 8
READY_TIMEOUT_S = 30
TRANSPORT_ERRORS_ALLOWED = 2
EPOCH = re.compile(r"^\s*(\d+\.\d+)\s")
BASELINE = json.loads(pathlib.Path(__file__).with_name("native-baseline.json").read_text())


def adb(*args, timeout=None):
    return subprocess.check_output(["adb", *args], text=True, timeout=timeout)


def epoch_ms(line):
    match = EPOCH.match(line)
    if not match:
        raise RuntimeError(f"Unparseable logcat line: {line!r}")
    return round(float(match.group(1)) * 1000)


def launch_fields(output):
    return dict(re.findall(r"^(\w+): (.*?)\s*$", output, re.M))


def ready_at(pid, began, out, iteration):
    """Device time at which this PID logged the interactive marker.

    One logcat stream, filtered on the device, waits for the marker. Repeated
    full log dumps from the host are slower, and they load the emulator while
    the app starts. A dropped stream reopens for the same PID. The marker keeps
    its device timestamp, so reconnect time does not enter the sample.
    """
    disconnects = 0
    while True:
        remaining = READY_TIMEOUT_S - (time.monotonic() - began)
        if remaining <= 0:
            raise RuntimeError(f"App did not report interactive within {READY_TIMEOUT_S} seconds")
        try:
            output = adb("logcat", "-v", "epoch", f"--pid={pid}", "-e", MARKER, "-m", "1",
                         timeout=remaining)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"App did not report interactive within {READY_TIMEOUT_S} seconds") from None
        except subprocess.CalledProcessError as error:
            if error.returncode != 255:
                raise
            disconnects += 1
            with (out / "startup-transport-errors.jsonl").open("a") as evidence:
                evidence.write(json.dumps({"iteration": iteration, "pid": pid,
                    "elapsedMs": round((time.monotonic() - began) * 1000),
                    "returnCode": error.returncode}) + "\n")
            if disconnects > TRANSPORT_ERRORS_ALLOWED:
                raise
            continue
        lines = [line for line in output.splitlines() if MARKER in line]
        if not lines:
            raise RuntimeError(f"logcat ended before PID {pid} reported {MARKER}")
        return epoch_ms(lines[0])


def launch_started_at(after_ms, ready_ms):
    """Device time at which ActivityTaskManager started this launch."""
    log = adb("logcat", "-d", "-v", "epoch", "-s", "ActivityTaskManager:I")
    starts = [epoch_ms(line) for line in log.splitlines()
              if "START u" in line and f"cmp={ACTIVITY}" in line]
    starts = [started for started in starts if after_ms < started <= ready_ms]
    if not starts:
        raise RuntimeError("ActivityTaskManager START line for this launch is missing from logcat")
    return max(starts)


def control_first_frame(out, iteration):
    """Cold first-frame time of the control app, or None if it did not cold start."""
    package = CONTROL_ACTIVITY.split("/")[0]
    try:
        adb("shell", "am", "force-stop", package)
        output = adb("shell", "am", "start", "-W", "-n", CONTROL_ACTIVITY, timeout=30)
        adb("shell", "am", "force-stop", package)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        (out / f"control-launch-{iteration}.txt").write_text(f"control launch failed: {error!r}\n")
        return None
    (out / f"control-launch-{iteration}.txt").write_text(output)
    fields = launch_fields(output)
    if fields.get("Status") != "ok" or fields.get("LaunchState") != "COLD":
        return None
    return int(fields["TotalTime"])


def summarize(launches):
    measured = [launch for launch in launches if not launch["warmUp"]]
    interactive = [launch["deviceInteractiveMs"] for launch in measured]
    ratios = [launch["deviceInteractiveMs"] / launch["controlFirstFrameMs"]
              for launch in measured if launch["controlFirstFrameMs"]]
    controls = [launch["controlFirstFrameMs"] for launch in measured if launch["controlFirstFrameMs"]]
    baseline = BASELINE["startupInteractiveMedianMs"]
    median = round(statistics.median(interactive))
    return {
        "launches": launches,
        "interactiveMedianMs": median,
        "interactiveMaxMs": max(launch["deviceInteractiveMs"] for launch in launches),
        "baselineInteractiveMedianMs": baseline,
        "interactiveMedianBudgetMs": round(baseline * BASELINE["maximumStartupRegressionRatio"]),
        "launchCeilingMs": BASELINE["startupLaunchCeilingMs"],
        "regressionPercent": round((median / baseline - 1) * 100, 1),
        "firstFrameMedianMs": round(statistics.median(launch["firstFrameMs"] for launch in measured)),
        "hostObservedMedianMs": round(statistics.median(launch["hostObservedMs"] for launch in measured)),
        "controlFirstFrameMedianMs": round(statistics.median(controls)) if controls else None,
        "interactivePerControlMedian": round(statistics.median(ratios), 3) if ratios else None,
        "warmUpLaunches": WARMUP_LAUNCHES,
        "measuredLaunches": len(measured),
        "fixtureTasks": 500,
        "method": ("device logcat timestamps from the ActivityTaskManager START line to the app's "
                   f"{MARKER} line; launch 0 is a declared warm-up; {CONTROL_ACTIVITY} cold "
                   "first frame is recorded before each launch as a runner-speed reference"),
    }


def startup_failures(result):
    failures = []
    if result["interactiveMedianMs"] > result["interactiveMedianBudgetMs"]:
        failures.append(f"median {result['interactiveMedianMs']} ms > {result['interactiveMedianBudgetMs']} ms")
    if result["interactiveMaxMs"] > result["launchCeilingMs"]:
        failures.append(f"slowest launch {result['interactiveMaxMs']} ms > {result['launchCeilingMs']} ms")
    return failures


def measure(out):
    launches = []
    previous_ready = 0
    for iteration in range(WARMUP_LAUNCHES + MEASURED_LAUNCHES):
        control = control_first_frame(out, iteration)
        adb("shell", "am", "force-stop", PACKAGE)
        began = time.monotonic()
        launch = adb("shell", "am", "start", "-W", "-n", ACTIVITY)
        (out / f"launch-{iteration}.txt").write_text(launch)
        fields = launch_fields(launch)
        if fields.get("Status") != "ok" or fields.get("LaunchState") != "COLD":
            raise RuntimeError(f"Launch {iteration} was not a successful cold start: {fields}")
        # Only the current app PID's log is examined, so a previous launch's
        # interactive marker never counts as this launch's readiness.
        pid = adb("shell", "pidof", PACKAGE).strip()
        if not pid:
            raise RuntimeError(f"App process is not running after launch {iteration}")
        ready = ready_at(pid, began, out, iteration)
        host_observed = round((time.monotonic() - began) * 1000)
        started = launch_started_at(previous_ready, ready)
        previous_ready = ready
        launches.append({"iteration": iteration, "warmUp": iteration < WARMUP_LAUNCHES,
                         "deviceInteractiveMs": ready - started,
                         "firstFrameMs": int(fields["TotalTime"]),
                         "hostObservedMs": host_observed,
                         "controlFirstFrameMs": control})
        time.sleep(1)
    result = summarize(launches)
    (out / "startup.json").write_text(json.dumps(result, indent=2))
    failures = startup_failures(result)
    if failures:
        raise RuntimeError(f"Native startup budget exceeded: {'; '.join(failures)}. See startup.json")


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


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["startup", "scroll"])
    parser.add_argument("--out", default="artifacts/mobile-native")
    args = parser.parse_args()
    output = pathlib.Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    measure(output) if args.mode == "startup" else scroll(output)
