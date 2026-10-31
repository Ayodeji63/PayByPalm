#!/usr/bin/env python3
"""Standalone visual check. Stop the kiosk first to avoid two PWM owners."""
import argparse
import json
import logging
import signal
import time
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from led_controller import LEDController

parser = argparse.ArgumentParser()
parser.add_argument('--mock', action='store_true', help='No GPIO access; logs state changes')
parser.add_argument('--anticlockwise', action='store_true')
parser.add_argument('--capture-brightness', type=int, default=50)
parser.add_argument('--pin', type=int, choices=(12, 18), default=None,
                    help='BCM LED pin; otherwise use /etc/paybypalm/led.json, then legacy GPIO18')
args = parser.parse_args()
settings_path = Path('/etc/paybypalm/led.json')
settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
pin = args.pin if args.pin is not None else settings.get('pin', 18)
logging.basicConfig(level=logging.INFO, format='%(message)s')
signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
try:
    with LEDController(mock=args.mock, pin=pin, clockwise=not args.anticlockwise,
                       capture_brightness=args.capture_brightness) as leds:
        leds.loading_animation(); time.sleep(2.5)
        leds.start_palm_capture(); time.sleep(2)
        leds.stop_palm_capture()
        leds.loading_animation(); time.sleep(1)
        leds.show_success(); time.sleep(2.2)
        leds.show_error(); time.sleep(2.2)
        leds.turn_off_leds()
except KeyboardInterrupt:
    pass
