"""Startup samples come from device timestamps, not host polling time."""
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("native_check", pathlib.Path(__file__).with_name("native-check.py"))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)

STREAM = ("logcat", "-v", "epoch", "--pid=1234", "-e", "app_interactive_ready", "-m", "1")


def marker(ms, pid=1234):
    return f"  {ms / 1000:.3f}  {pid}  {pid} I ReactNativeJS: [PRAVAH_MOBILE] INFO app_interactive_ready {{}}\n"


def start_line(ms, activity=native.ACTIVITY):
    return (f"  {ms / 1000:.3f}   555  2367 I ActivityTaskManager: START u0 "
            f"{{flg=0x10000000 cmp={activity}}} with LAUNCH_SINGLE_TASK result code=0\n")


def am_start(state="COLD", total=3000):
    return (f"Starting: Intent\nStatus: ok\nLaunchState: {state}\n"
            f"Activity: x\nTotalTime: {total}\nWaitTime: {total}\nComplete\n")


class ClockTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.out = pathlib.Path(folder.name)
        self.now = 4.0
        for target, effect in (("monotonic", lambda: self.now), ("sleep", self.advance)):
            patcher = patch.object(native.time, target, side_effect=effect)
            patcher.start()
            self.addCleanup(patcher.stop)

    def advance(self, seconds):
        self.now += seconds


class ReadyAtTest(ClockTest):
    def test_returns_the_marker_device_time_from_one_filtered_stream(self):
        with patch.object(native, "adb", return_value=marker(1_731_470_910_842)) as adb:
            self.assertEqual(native.ready_at("1234", 0, self.out, 0), 1_731_470_910_842)
        self.assertEqual(adb.call_args.args, STREAM)
        self.assertEqual(adb.call_args.kwargs["timeout"], 26)

    def test_disconnect_reopens_the_same_pid_and_keeps_the_device_time(self):
        def read(*args, **kwargs):
            if adb.call_count == 1:
                self.now += 5
                raise subprocess.CalledProcessError(255, "adb")
            return marker(1_000_500)
        with patch.object(native, "adb", side_effect=read) as adb:
            self.assertEqual(native.ready_at("1234", 0, self.out, 2), 1_000_500)
        self.assertEqual([call.args for call in adb.call_args_list], [STREAM, STREAM])
        error = json.loads((self.out / "startup-transport-errors.jsonl").read_text())
        self.assertEqual((error["iteration"], error["pid"], error["returnCode"]), (2, "1234", 255))

    def test_repeated_disconnects_fail(self):
        with patch.object(native, "adb", side_effect=subprocess.CalledProcessError(255, "adb")) as adb:
            with self.assertRaises(subprocess.CalledProcessError):
                native.ready_at("1234", 0, self.out, 0)
        self.assertEqual(adb.call_count, 3)

    def test_other_command_failures_are_not_retried(self):
        with patch.object(native, "adb", side_effect=subprocess.CalledProcessError(1, "adb")) as adb:
            with self.assertRaises(subprocess.CalledProcessError):
                native.ready_at("1234", 0, self.out, 0)
        self.assertEqual(adb.call_count, 1)

    def test_absent_marker_fails_at_the_deadline(self):
        with patch.object(native, "adb", side_effect=subprocess.TimeoutExpired("adb", 26)):
            with self.assertRaisesRegex(RuntimeError, "within 30 seconds"):
                native.ready_at("1234", 0, self.out, 0)

    def test_stream_that_ends_without_the_marker_fails(self):
        with patch.object(native, "adb", return_value="--------- beginning of main\n"):
            with self.assertRaisesRegex(RuntimeError, "logcat ended"):
                native.ready_at("1234", 0, self.out, 0)


class LaunchStartedAtTest(unittest.TestCase):
    def test_picks_this_launch_start_and_ignores_others(self):
        log = (start_line(1_000) + start_line(5_000) + start_line(9_000, native.CONTROL_ACTIVITY)
               + start_line(9_500) + start_line(20_000))
        with patch.object(native, "adb", return_value=log):
            self.assertEqual(native.launch_started_at(6_000, 15_000), 9_500)

    def test_missing_start_line_fails(self):
        with patch.object(native, "adb", return_value=start_line(1_000)):
            with self.assertRaisesRegex(RuntimeError, "START line"):
                native.launch_started_at(6_000, 15_000)


class FakeDevice:
    """Answers the ADB calls of one startup run on a fake device clock."""

    def __init__(self, interactive, control="ok", state="COLD"):
        self.interactive = list(interactive)
        self.control = control
        self.state = state
        self.clock = 1_000_000
        self.starts = ""
        self.ready = None

    def __call__(self, *args, timeout=None):
        if args[:3] == ("shell", "am", "force-stop"):
            return ""
        if args[:5] == ("shell", "am", "start", "-W", "-n"):
            self.clock += 10_000
            if args[5] == native.CONTROL_ACTIVITY:
                if self.control == "error":
                    raise subprocess.CalledProcessError(1, "adb")
                return am_start(total=1_500)
            self.starts += start_line(self.clock)
            self.ready = self.clock + self.interactive.pop(0)
            return am_start(self.state)
        if args == ("shell", "pidof", native.PACKAGE):
            return "1234\n"
        if args[:2] == ("logcat", "-v"):
            return marker(self.ready)
        if args[:2] == ("logcat", "-d"):
            return self.starts
        raise AssertionError(f"unexpected adb call {args}")


class MeasureTest(ClockTest):
    def run_measure(self, device):
        with patch.object(native, "adb", side_effect=device):
            native.measure(self.out)

    def result(self):
        return json.loads((self.out / "startup.json").read_text())

    def test_warm_up_is_recorded_but_not_in_the_median(self):
        self.run_measure(FakeDevice([12_000, 6_000, 6_100, 6_200, 6_300, 6_400, 6_500, 6_600, 6_700]))
        result = self.result()
        self.assertEqual(len(result["launches"]), 9)
        self.assertTrue(result["launches"][0]["warmUp"])
        self.assertEqual(result["launches"][0]["deviceInteractiveMs"], 12_000)
        self.assertEqual(result["interactiveMedianMs"], 6_350)
        self.assertEqual(result["interactiveMaxMs"], 12_000)
        self.assertEqual(result["firstFrameMedianMs"], 3_000)
        self.assertEqual(result["controlFirstFrameMedianMs"], 1_500)
        self.assertAlmostEqual(result["interactivePerControlMedian"], 6_350 / 1_500, places=3)

    def test_median_over_budget_fails_after_writing_evidence(self):
        with self.assertRaisesRegex(RuntimeError, "median 9000 ms"):
            self.run_measure(FakeDevice([9_000] * 9))
        self.assertEqual(self.result()["interactiveMedianMs"], 9_000)

    def test_ceiling_applies_to_the_warm_up(self):
        with self.assertRaisesRegex(RuntimeError, "slowest launch 16000 ms"):
            self.run_measure(FakeDevice([16_000] + [6_000] * 8))

    def test_warm_launch_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "not a successful cold start"):
            self.run_measure(FakeDevice([6_000] * 9, state="WARM"))

    def test_control_failure_is_recorded_without_failing_startup(self):
        self.run_measure(FakeDevice([6_000] * 9, control="error"))
        result = self.result()
        self.assertIsNone(result["controlFirstFrameMedianMs"])
        self.assertIsNone(result["interactivePerControlMedian"])
        self.assertIn("control launch failed", (self.out / "control-launch-0.txt").read_text())


if __name__ == "__main__":
    unittest.main()
