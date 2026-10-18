#!/usr/bin/env python3
"""Bounded Chromium native-messaging bridge. No network listener or account data."""
import json
import logging
from pathlib import Path
import signal
import struct
import sys
import time

# Installed beside this root-owned file; python -I excludes user import paths.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from led_controller import LEDController, LEDState

HOST_NAME = 'org.paybypalm.led'
MAX_MESSAGE = 1024


def read_exact(source, length):
    data = bytearray()
    while len(data) < length:
        part = source.read(length - len(data))
        if not part:
            if not data:
                return None
            raise ValueError('Truncated native message')
        data.extend(part)
    return bytes(data)


def read_message(source):
    header = read_exact(source, 4)
    if header is None:
        return None
    size = struct.unpack('=I', header)[0]
    if not 0 < size <= MAX_MESSAGE:
        raise ValueError('Invalid native message size')
    body = read_exact(source, size)
    if body is None:
        raise ValueError('Missing native message')
    message = json.loads(body)
    if not isinstance(message, dict) or set(message) != {'id', 'state'}:
        raise ValueError('Only an LED state command is allowed')
    if not isinstance(message['id'], str) or len(message['id']) > 80:
        raise ValueError('Invalid correlation id')
    message['state'] = LEDState(message['state'])
    return message


def serve(controller, source, destination):
    window, count = time.monotonic(), 0
    try:
        while (message := read_message(source)) is not None:
            now = time.monotonic()
            if now - window >= 1:
                window, count = now, 0
            count += 1
            allowed = count <= 40 or message['state'] == LEDState.OFF
            applied = bool(allowed and controller and controller.set_state(message['state'], wait=True))
            response = json.dumps({'id': message['id'], 'available': applied,
                                   'mock': bool(controller and controller.mock),
                                   'state': message['state'].value}).encode()
            destination.write(struct.pack('=I', len(response)) + response)
            destination.flush()
    finally:
        if controller:
            controller.cleanup()


def main():
    logging.basicConfig(level=logging.INFO, stream=sys.stderr, format='%(levelname)s %(message)s')
    settings_path = Path('/etc/paybypalm/led.json')
    settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    allowed = {'brightness', 'capture_brightness', 'clockwise', 'step_seconds', 'mock'}
    if not isinstance(settings, dict) or not set(settings) <= allowed:
        raise ValueError('Invalid LED configuration')
    controller = None
    try:
        controller = LEDController(**settings)
    except Exception:
        logging.error('LED initialization failed; check GPIO18, PWM audio conflict and hardware permissions')
    def stop(_signal, _frame):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGHUP, stop)
    try:
        serve(controller, sys.stdin.buffer, sys.stdout.buffer)
    finally:
        if controller:
            controller.cleanup()


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, TypeError):
        print('LED bridge stopped: invalid configuration/message or disconnected browser', file=sys.stderr)
        sys.exit(1)
