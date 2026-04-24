from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


DEFAULT_LOGIN_USERNAME = "player"
DEFAULT_LOGIN_PASSWORD = "player"
DEFAULT_SESSION_SECRET = "player-web-dev-session-secret"


def _auth_file_path() -> Path | None:
    raw = os.environ.get("PLAYER_WEB_AUTH_FILE", "/etc/player-web/auth.json").strip()
    if not raw:
        return None
    return Path(raw)


def _load_auth_file() -> dict[str, Any]:
    path = _auth_file_path()
    if path is None or not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _read_value(file_key: str, env_key: str, default: str) -> str:
    payload = _load_auth_file()
    value = payload.get(file_key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    env_value = os.environ.get(env_key, "").strip()
    if env_value:
        return env_value
    return default


def get_login_username() -> str:
    return _read_value("username", "PLAYER_WEB_LOGIN_USERNAME", DEFAULT_LOGIN_USERNAME)


def get_login_password() -> str:
    return _read_value("password", "PLAYER_WEB_LOGIN_PASSWORD", DEFAULT_LOGIN_PASSWORD)


def get_session_secret() -> str:
    return _read_value("sessionSecret", "PLAYER_WEB_SESSION_SECRET", DEFAULT_SESSION_SECRET)
