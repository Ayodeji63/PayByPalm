"""One WS2812 writer thread. GPIO18/PWM0, Pi 4; mockable without hardware."""
from enum import Enum
from collections import deque
import fcntl
import logging
import os
from pathlib import Path
import threading
import time

LED_COUNT = 12
LED_PIN = 18
LED_FREQ_HZ = 800000
LED_DMA = 10
LED_INVERT = False
LED_BRIGHTNESS = 70
LED_CHANNEL = 0
LOG = logging.getLogger(__name__)


class LEDState(str, Enum):
    OFF = 'OFF'
    LOADING = 'LOADING'
    CAPTURING = 'CAPTURING'
    SUCCESS = 'SUCCESS'
    ERROR = 'ERROR'


class MockStrip:
    """Records complete frames; never imports GPIO drivers."""
    mock = True

    def __init__(self):
        self.frames = deque(maxlen=4096)
        self.owner_threads = set()

    def render(self, pixels, brightness):
        self.owner_threads.add(threading.get_ident())
        self.frames.append((tuple(pixels), brightness))

    def close(self):
        pass


class WS2812Strip:
    mock = False

    def __init__(self):
        # PWM/DMA must have one owner, including standalone diagnostic processes.
        self.lock = os.open('/run/paybypalm-led.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            from rpi_ws281x import PixelStrip, Color
            self.color = Color
            self.strip = PixelStrip(LED_COUNT, LED_PIN, LED_FREQ_HZ, LED_DMA,
                                    LED_INVERT, LED_BRIGHTNESS, LED_CHANNEL)
            self.strip.begin()
        except Exception:
            os.close(self.lock)
            raise

    def render(self, pixels, brightness):
        self.strip.setBrightness(brightness)
        for i, rgb in enumerate(pixels):
            self.strip.setPixelColor(i, self.color(*rgb))
        self.strip.show()

    def close(self):
        # Library cleanup also occurs at interpreter exit.
        self.strip._cleanup()
        os.close(self.lock)


def is_raspberry_pi():
    try:
        return b'Raspberry Pi' in Path('/proc/device-tree/model').read_bytes()
    except OSError:
        return False


class LEDController:
    def __init__(self, *, strip=None, mock=False, brightness=LED_BRIGHTNESS,
                 capture_brightness=50, clockwise=True, step_seconds=0.1,
                 feedback_seconds=2.0, capture_timeout=10.0, loading_timeout=90.0):
        if not all(type(v) is int and 0 <= v <= 255 for v in (brightness, capture_brightness)):
            raise ValueError('Brightness must be an integer from 0 to 255')
        if not all(isinstance(v, (int, float)) and 0 < v <= 120 for v in
                   (step_seconds, feedback_seconds, capture_timeout, loading_timeout)):
            raise ValueError('LED timing must be positive and at most 120 seconds')
        if type(clockwise) is not bool or type(mock) is not bool:
            raise ValueError('Rotation and mock must be booleans')
        self.brightness, self.capture_brightness = brightness, capture_brightness
        self.clockwise, self.step_seconds = clockwise, step_seconds
        self.feedback_seconds = feedback_seconds
        self.capture_timeout, self.loading_timeout = capture_timeout, loading_timeout
        self._strip = strip
        self._mock_requested = mock or not is_raspberry_pi()
        self._condition = threading.Condition()
        self._state = LEDState.OFF
        self._revision = 0
        self._applied = -1
        self._closing = False
        self.error = None
        self._worker = threading.Thread(target=self._run, name='paybypalm-led', daemon=True)
        self._worker.start()
        with self._condition:
            self._condition.wait_for(lambda: self._applied >= 0 or self.error is not None, timeout=2)
        if self.error:
            raise RuntimeError('LED hardware initialization failed') from self.error

    @property
    def state(self):
        with self._condition:
            return self._state

    @property
    def mock(self):
        return bool(getattr(self._strip, 'mock', False))

    def set_state(self, state, *, wait=False):
        state = LEDState(state)
        with self._condition:
            if self._closing or self.error:
                return False
            self._state = state
            self._revision += 1
            revision = self._revision
            self._condition.notify_all()
            if wait:
                self._condition.wait_for(lambda: self._applied >= revision or self.error is not None or self._closing, timeout=1)
            return not self.error and (not wait or self._applied >= revision)

    def loading_animation(self):
        return self.set_state(LEDState.LOADING)

    def start_palm_capture(self):
        return self.set_state(LEDState.CAPTURING, wait=True)

    def stop_palm_capture(self):
        return self.set_state(LEDState.OFF, wait=True)

    def show_success(self):
        return self.set_state(LEDState.SUCCESS)

    def show_error(self):
        return self.set_state(LEDState.ERROR)

    def turn_off_leds(self):
        return self.set_state(LEDState.OFF, wait=True)

    def _run(self):
        black = [(0, 0, 0)] * LED_COUNT
        try:
            if self._strip is None:
                self._strip = MockStrip() if self._mock_requested else WS2812Strip()
            seen, deadline, next_frame, index = -1, None, 0, 0
            while True:
                with self._condition:
                    if self._closing:
                        break
                    now = time.monotonic()
                    changed = seen != self._revision
                    if changed:
                        seen, index = self._revision, 0
                        duration = self.feedback_seconds if self._state in (LEDState.SUCCESS, LEDState.ERROR) else self.capture_timeout if self._state == LEDState.CAPTURING else self.loading_timeout if self._state == LEDState.LOADING else None
                        deadline = now + duration if duration else None
                        next_frame = now
                        LOG.info('LED state %s%s', self._state.value, ' (mock)' if self.mock else '')
                    if deadline is not None and now >= deadline:
                        self._state = LEDState.OFF
                        self._revision += 1
                        continue
                    state = self._state
                    if changed or (state == LEDState.LOADING and now >= next_frame):
                        pixels = black.copy()
                        if state == LEDState.LOADING:
                            pixels[index] = (0, 0, 255)
                            index = (index + (1 if self.clockwise else -1)) % LED_COUNT
                        elif state != LEDState.OFF:
                            color = {LEDState.CAPTURING: (255, 255, 255), LEDState.SUCCESS: (0, 255, 0), LEDState.ERROR: (255, 0, 0)}[state]
                            pixels = [color] * LED_COUNT
                        # The only thread which touches the hardware. Keeping the
                        # condition during render makes a completed transition a barrier.
                        self._strip.render(pixels, self.capture_brightness if state == LEDState.CAPTURING else self.brightness)
                        self._applied = seen
                        self._condition.notify_all()
                        next_frame = now + self.step_seconds
                    wake = min(next_frame if state == LEDState.LOADING else float('inf'), deadline or float('inf'))
                    self._condition.wait(timeout=max(0.001, wake - time.monotonic()) if wake != float('inf') else None)
        except Exception as error:
            with self._condition:
                self.error = error
                self._condition.notify_all()
            LOG.error('LED hardware unavailable; camera/backend operation may continue')
        finally:
            if self._strip is not None:
                try:
                    self._strip.render(black, self.brightness)
                except Exception:
                    LOG.error('Could not clear LED hardware')
                finally:
                    try:
                        self._strip.close()
                    except Exception:
                        LOG.error('Could not release LED hardware')

    def cleanup(self):
        with self._condition:
            self._state = LEDState.OFF
            self._closing = True
            self._condition.notify_all()
        if self._worker is not threading.current_thread():
            self._worker.join(timeout=2)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.cleanup()
