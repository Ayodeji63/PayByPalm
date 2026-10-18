#!/usr/bin/env python3
"""Build a private extension; print only the non-secret kiosk URL."""
import argparse
import json
import os
import stat
from pathlib import Path
from urllib.parse import urlsplit
from kiosk_config import config_path, read_config


def prepare(config, directory):
    url, key = read_config(config)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Extension directory must be private to the kiosk user')
    parsed = urlsplit(url)
    origin = f'{parsed.scheme}://{parsed.netloc}'
    # Device bootstrap stays usable without the optional local LED installation.
    manifest = {
        'manifest_version': 3, 'name': 'PayByPalm device bootstrap', 'version': '1.0.0',
        'content_scripts': [{
            'matches': [origin + '/terminal*'], 'js': ['bootstrap.js'],
            'run_at': 'document_start', 'all_frames': False,
        }],
    }
    script = '''(() => {
  if (window.top !== window || location.origin !== ORIGIN ||
      !(location.pathname === '/terminal' || location.pathname.startsWith('/terminal/'))) return;
  sessionStorage.setItem('paybypalm.terminalKey', KEY);
})();
'''.replace('ORIGIN', json.dumps(origin)).replace('KEY', json.dumps(key))
    files = [('bootstrap.js', script)]
    if (config.parent / 'led-enabled').is_file():
        assets = Path(__file__).resolve().parent
        manifest['key'] = (assets / 'led-extension-key.txt').read_text().strip()
        manifest['permissions'] = ['nativeMessaging']
        manifest['background'] = {'service_worker': 'led-background.js'}
        manifest['content_scripts'][0]['js'].append('led-content.js')
        for name in ('led-content.js', 'led-background.js'):
            files.append((name, (assets / name).read_text().replace('__PBP_ORIGIN__', json.dumps(origin))))
    files.append(('manifest.json', json.dumps(manifest)))
    for name, content in files:
        fd = os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as handle:
            handle.write(content)
    return url


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, default=config_path())
    parser.add_argument('--extension-dir', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(prepare(args.config, args.extension_dir))
    except (OSError, ValueError):
        parser.exit(1, 'Kiosk bootstrap failed. Check config ownership, mode 0600, HTTPS /terminal URL, and device key.\n')
