import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PI = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PI))
from kiosk_config import read_config
spec = importlib.util.spec_from_file_location('prepare', PI / 'prepare-kiosk.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / 'terminal.env'
        self.key = 'pbp_' + 'a' * 64
        self.write_config('https://wallet.example/terminal')

    def write_config(self, url):
        self.config.write_text(f'KIOSK_URL={url}\nTERMINAL_KEY={self.key}\n')
        self.config.chmod(0o600)

    def test_prepares_only_scoped_document_start_extension(self):
        extension = self.root / 'extension'
        extension.mkdir(mode=0o700)
        self.assertEqual(prepare.prepare(self.config, extension), 'https://wallet.example/terminal')
        manifest = json.loads((extension / 'manifest.json').read_text())
        self.assertEqual(manifest['content_scripts'][0]['matches'], ['https://wallet.example/terminal*'])
        self.assertEqual(manifest['content_scripts'][0]['run_at'], 'document_start')
        self.assertNotIn('web_accessible_resources', manifest)
        self.assertEqual((extension / 'bootstrap.js').stat().st_mode & 0o777, 0o600)
        self.assertNotIn(self.key, json.dumps(manifest))

    def test_rejects_unsafe_urls_without_printing_credentials(self):
        for url in ['http://wallet.example/terminal', 'https://wallet.example/terminal?k=secret',
                    'https://user:pass@wallet.example/terminal', 'https://*.example/terminal',
                    'https://wallet.example/login', 'https://wallet.example/terminal#secret']:
            with self.subTest(url=url):
                self.write_config(url)
                with self.assertRaises(ValueError): read_config(self.config)

    def test_rejects_readable_or_symlinked_key_files(self):
        self.config.chmod(0o644)
        with self.assertRaises(ValueError): read_config(self.config)
        link = self.root / 'link'
        link.symlink_to(self.config)
        with self.assertRaises(OSError): read_config(link)

    def test_provisioning_never_prints_key_or_overwrites_existing_device(self):
        config_home = self.root / 'config'
        env = {**os.environ, 'XDG_CONFIG_HOME': str(config_home)}
        command = [sys.executable, str(PI / 'provision-terminal.py'), '--url', 'https://wallet.example/terminal',
                   '--merchant-id', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', '--label', "Counter's till"]
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        config = config_home / 'paybypalm/terminal.env'
        _, key = read_config(config)
        self.assertNotIn(key, result.stdout + result.stderr)
        self.assertIn("Counter''s till", result.stdout)
        second = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertNotEqual(second.returncode, 0)
        self.assertEqual(read_config(config)[1], key)

    def test_launcher_passes_clean_arguments_and_cleans_runtime_extension(self):
        config_home = self.root / 'launcher-config'
        device_dir = config_home / 'paybypalm'
        device_dir.mkdir(parents=True)
        device_config = device_dir / 'terminal.env'
        device_config.write_text(self.config.read_text())
        device_config.chmod(0o600)
        binary_dir = self.root / 'bin'
        binary_dir.mkdir()
        result_file = self.root / 'arguments.json'
        chromium = binary_dir / 'chromium'
        chromium.write_text('#!/usr/bin/env python3\nimport json,os,sys\nfrom pathlib import Path\n'
            'args=sys.argv[1:]\n'
            'extension=next(x.split("=",1)[1] for x in args if x.startswith("--load-extension="))\n'
            'Path(os.environ["PBP_TEST_RESULT"]).write_text(json.dumps({"args":args,"extension":extension,"prepared":(Path(extension)/"bootstrap.js").exists()}))\n')
        chromium.chmod(0o700)
        curl = binary_dir / 'curl'
        curl.write_text('#!/bin/sh\nexit 0\n')
        curl.chmod(0o700)
        env = {**os.environ, 'PATH': str(binary_dir) + os.pathsep + os.environ['PATH'],
               'XDG_CONFIG_HOME': str(config_home), 'XDG_CACHE_HOME': str(self.root / 'cache'),
               'XDG_RUNTIME_DIR': str(self.root), 'XDG_SESSION_TYPE': 'wayland',
               'WAYLAND_DISPLAY': 'wayland-test', 'PBP_TEST_RESULT': str(result_file)}
        result = subprocess.run(['bash', str(PI / 'paybypalm-kiosk.sh')], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        evidence = json.loads(result_file.read_text())
        self.assertTrue(evidence['prepared'])
        self.assertEqual(evidence['args'][-1], 'https://wallet.example/terminal')
        self.assertNotIn(self.key, result_file.read_text() + result.stdout + result.stderr)
        self.assertFalse(Path(evidence['extension']).exists())

    def test_shell_config_is_not_executed(self):
        self.config.write_text('KIOSK_URL=$(touch /tmp/pbp-not-executed)\nTERMINAL_KEY=' + self.key)
        with self.assertRaises(ValueError): read_config(self.config)


if __name__ == '__main__':
    unittest.main()
