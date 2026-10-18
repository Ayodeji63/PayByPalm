import io
import json
from pathlib import Path
import struct
import sys
import threading
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from led_controller import LEDController, LEDState, MockStrip
from led_host import read_message, serve


def wait_for(predicate, timeout=1):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return
        time.sleep(0.002)
    raise AssertionError('LED worker did not reach expected state')


class LEDTests(unittest.TestCase):
    def controller(self, **settings):
        strip = MockStrip()
        controller = LEDController(strip=strip, step_seconds=0.01, feedback_seconds=0.06, capture_timeout=0.12, **settings)
        self.addCleanup(controller.cleanup)
        return controller, strip

    def test_blue_chase_has_one_pixel_and_both_directions(self):
        for clockwise, expected in [(True, [0, 1, 2]), (False, [0, 11, 10])]:
            leds, strip = self.controller(clockwise=clockwise)
            leds.loading_animation()
            wait_for(lambda: len([f for f, _ in strip.frames if (0, 0, 255) in f]) >= 3)
            blue = [f for f, _ in strip.frames if (0, 0, 255) in f][:3]
            self.assertEqual([f.index((0, 0, 255)) for f in blue], expected)
            self.assertTrue(all(sum(rgb != (0, 0, 0) for rgb in f) == 1 for f in blue))
            leds.cleanup()

    def test_capture_interrupts_loading_and_is_steady(self):
        leds, strip = self.controller()
        leds.loading_animation()
        self.assertTrue(leds.start_palm_capture())
        first = len(strip.frames)
        time.sleep(0.04)
        self.assertEqual(len(strip.frames), first, 'white capture must not animate')
        self.assertEqual(strip.frames[-1], (tuple([(255, 255, 255)] * 12), 50))
        leds.stop_palm_capture()
        self.assertTrue(all(rgb == (0, 0, 0) for rgb in strip.frames[-1][0]))
        leds.loading_animation()
        wait_for(lambda: (0, 0, 255) in strip.frames[-1][0])

    def test_feedback_overrides_loading_and_expires(self):
        leds, strip = self.controller()
        for state, color in [(LEDState.SUCCESS, (0, 255, 0)), (LEDState.ERROR, (255, 0, 0))]:
            leds.loading_animation()
            self.assertTrue(leds.set_state(state, wait=True))
            self.assertEqual(strip.frames[-1][0], tuple([color] * 12))
            wait_for(lambda: leds.state == LEDState.OFF)
            wait_for(lambda: strip.frames[-1][0] == tuple([(0, 0, 0)] * 12))

    def test_new_capture_cancels_old_feedback_timeout(self):
        leds, strip = self.controller()
        leds.show_success()
        time.sleep(0.03)
        leds.start_palm_capture()
        time.sleep(0.05)
        self.assertEqual(leds.state, LEDState.CAPTURING)
        self.assertEqual(strip.frames[-1][0], tuple([(255, 255, 255)] * 12))

    def test_capture_and_processing_watchdogs_clear_stuck_states(self):
        leds, strip = self.controller(loading_timeout=0.08)
        leds.start_palm_capture()
        wait_for(lambda: leds.state == LEDState.OFF)
        leds.loading_animation()
        wait_for(lambda: leds.state == LEDState.OFF)
        wait_for(lambda: strip.frames[-1][0] == tuple([(0, 0, 0)] * 12))

    def test_rapid_transitions_have_one_hardware_writer_and_shutdown_clears(self):
        leds, strip = self.controller()
        def change():
            for _ in range(30):
                for state in LEDState:
                    leds.set_state(state)
        threads = [threading.Thread(target=change) for _ in range(5)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        leds.set_state('CAPTURING', wait=True)
        leds.cleanup()
        self.assertEqual(len(strip.owner_threads), 1)
        self.assertEqual(strip.frames[-1][0], tuple([(0, 0, 0)] * 12))
        self.assertFalse(leds._worker.is_alive())

    def test_render_failure_does_not_create_replacement_writers(self):
        class BrokenStrip(MockStrip):
            def render(self, pixels, brightness):
                if (255, 255, 255) in pixels:
                    raise OSError('simulated hardware failure')
                super().render(pixels, brightness)
        strip = BrokenStrip()
        leds = LEDController(strip=strip)
        self.addCleanup(leds.cleanup)
        self.assertFalse(leds.start_palm_capture())
        self.assertIsNotNone(leds.error)
        self.assertFalse(leds.show_success())

    def test_native_protocol_is_bounded_and_accepts_only_states(self):
        for value in [{'id': 'x', 'state': 'CAPTURING'}, {'id': 'x', 'state': 'OFF'}]:
            data = json.dumps(value).encode()
            result = read_message(io.BytesIO(struct.pack('=I', len(data)) + data))
            self.assertEqual(result['state'].value, value['state'])
        for data in [struct.pack('=I', 100000), struct.pack('=I', 5) + b'{}',
                     struct.pack('=I', 31) + b'{"id":"x","state":"run-shell"}']:
            with self.assertRaises(ValueError):
                read_message(io.BytesIO(data))

    def test_native_eof_and_bad_commands_always_clear_ring(self):
        for state in ['CAPTURING', 'LOADING', 'SUCCESS', 'ERROR']:
            leds, strip = self.controller()
            data = json.dumps({'id': 'test', 'state': state}).encode()
            output = io.BytesIO()
            serve(leds, io.BytesIO(struct.pack('=I', len(data)) + data), output)
            self.assertTrue(json.loads(output.getvalue()[4:])['available'])
            self.assertEqual(strip.frames[-1][0], tuple([(0, 0, 0)] * 12))
        leds, strip = self.controller()
        leds.start_palm_capture()
        with self.assertRaises(ValueError):
            serve(leds, io.BytesIO(struct.pack('=I', 999999)), io.BytesIO())
        self.assertEqual(strip.frames[-1][0], tuple([(0, 0, 0)] * 12))


if __name__ == '__main__':
    unittest.main()
