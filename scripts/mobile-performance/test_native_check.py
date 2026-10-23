"""Transport recovery must retain the same process and elapsed startup time."""
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


class InteractiveTimeTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.out = pathlib.Path(folder.name)
        self.now = 4.0
        self.clock = patch.object(native.time, "monotonic", side_effect=lambda: self.now)
        self.sleep = patch.object(native.time, "sleep", side_effect=self.advance)
        self.clock.start()
        self.sleep.start()
        self.addCleanup(self.clock.stop)
        self.addCleanup(self.sleep.stop)

    def advance(self, seconds):
        self.now += seconds

    def test_disconnect_keeps_original_pid_and_charges_elapsed_time(self):
        with patch.object(native, "adb", side_effect=[subprocess.CalledProcessError(255, "adb"), "app_interactive_ready"]) as adb:
            self.assertEqual(native.interactive_time("1234", 0, self.out, 2), 4100)
        for call in adb.call_args_list:
            self.assertEqual(call.args, ("logcat", "-d", "--pid", "1234", "-v", "epoch"))
        error = json.loads((self.out / "startup-transport-errors.jsonl").read_text())
        self.assertEqual((error["iteration"], error["pid"], error["returnCode"]), (2, "1234", 255))

    def test_repeated_disconnects_fail_without_accepting_a_later_sample(self):
        with patch.object(native, "adb", side_effect=subprocess.CalledProcessError(255, "adb")) as adb:
            with self.assertRaises(subprocess.CalledProcessError):
                native.interactive_time("1234", 0, self.out, 0)
        self.assertEqual(adb.call_count, 3)

    def test_other_command_failures_are_not_retried(self):
        with patch.object(native, "adb", side_effect=subprocess.CalledProcessError(1, "adb")) as adb:
            with self.assertRaises(subprocess.CalledProcessError):
                native.interactive_time("1234", 0, self.out, 0)
        self.assertEqual(adb.call_count, 1)

    def test_log_timeout_remains_part_of_startup_measurement(self):
        def read(*args, **kwargs):
            if self.now == 4:
                self.now += 5
                raise subprocess.TimeoutExpired("adb", 5)
            return "app_interactive_ready"
        with patch.object(native, "adb", side_effect=read):
            self.assertEqual(native.interactive_time("1234", 0, self.out, 0), 9100)

    def test_absent_interactive_marker_still_fails(self):
        with patch.object(native, "adb", return_value="other log message"):
            with self.assertRaisesRegex(RuntimeError, "within 30 seconds"):
                native.interactive_time("1234", 0, self.out, 0)


if __name__ == "__main__":
    unittest.main()
