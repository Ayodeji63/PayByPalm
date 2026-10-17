"""Device-local configuration. Never import this into the public web app."""
import os
import re
import shlex
import stat
from pathlib import Path
from urllib.parse import urlsplit


def read_config(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError("terminal.env must belong to the kiosk user and have mode 0600")
        values = {}
        for line in handle:
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            name, separator, value = line.strip().partition('=')
            if not separator or name not in ('KIOSK_URL', 'TERMINAL_KEY') or name in values:
                raise ValueError("Invalid or duplicate setting in terminal.env")
            tokens = shlex.split(value, comments=False)
            if len(tokens) != 1:
                raise ValueError("Each setting needs one value in terminal.env")
            values[name] = tokens[0]
    url = values.get('KIOSK_URL', '')
    parsed = urlsplit(url)
    local_http = parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1')
    if (parsed.scheme != 'https' and not local_http) or not parsed.hostname:
        raise ValueError("KIOSK_URL needs HTTPS (HTTP is allowed only on localhost)")
    if (parsed.username or parsed.password or parsed.query or parsed.fragment or
            parsed.path != '/terminal' or not re.fullmatch(r'[A-Za-z0-9.:-]+', parsed.netloc)):
        raise ValueError("KIOSK_URL must end in /terminal, without credentials, queries or fragments")
    # Validate port syntax/range too; reject extension match-pattern metacharacters.
    parsed.port
    key = values.get('TERMINAL_KEY', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', key):
        raise ValueError("TERMINAL_KEY needs a fresh random device key of at least 32 characters")
    return url, key


def config_path():
    return Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config'))) / 'paybypalm/terminal.env'
