#!/usr/bin/env python3
"""Generate a device key locally and print SQL containing its hash only."""
import argparse
import hashlib
import os
import secrets
import shlex
import uuid
from kiosk_config import config_path, read_config

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--merchant-id', required=True, type=uuid.UUID)
parser.add_argument('--label', required=True)
args = parser.parse_args()
if not args.label.strip() or len(args.label) > 120 or any(ord(c) < 32 for c in args.label):
    parser.error('Use a terminal label of 1–120 printable characters')
path = config_path()
path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
key = 'pbp_' + secrets.token_hex(32)
try:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    parser.exit(1, 'Device configuration already exists; no key was changed. Keep it for normal restarts.\n')
try:
    with os.fdopen(fd, 'w') as handle:
        handle.write(f'KIOSK_URL={shlex.quote(args.url)}\nTERMINAL_KEY={key}\n')
    read_config(path)
except (ValueError, OSError):
    path.unlink(missing_ok=True)
    parser.exit(1, 'Invalid kiosk URL/configuration. Use HTTPS and the exact /terminal path.\n')
label = args.label.replace("'", "''")
digest = hashlib.sha256(key.encode()).hexdigest()
print('Device key saved privately. Run this SQL once in the intended Supabase project:')
print("insert into public.terminals (merchant_id, label, api_key_hash)")
print(f"values ('{args.merchant_id}', '{label}', '{digest}');")
print('Only the hash is shown. Do not copy terminal.env into Git or chat.')
