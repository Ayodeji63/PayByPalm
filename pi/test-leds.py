#!/usr/bin/env python3
"""Standalone visual check. Stop the kiosk first to avoid two PWM owners."""
import argparse
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
args = parser.parse_args()
logging.basicConfig(level=logging.INFO, format='%(message)s')
signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
try:
    with LEDController(mock=args.mock, clockwise=not args.anticlockwise,
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
