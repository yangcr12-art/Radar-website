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


def _normalize_accounts(payload: dict[str, Any]) -> list[dict[str, str]]:
    raw_accounts = payload.get("accounts")
    normalized: list[dict[str, str]] = []
    if isinstance(raw_accounts, list):
        for item in raw_accounts:
            if not isinstance(item, dict):
                continue
            username = str(item.get("username", "")).strip()
            password = str(item.get("password", ""))
            if username and password:
                normalized.append({"username": username, "password": password})
    if normalized:
        return normalized

    legacy_username = str(payload.get("username", "")).strip()
    legacy_password = str(payload.get("password", ""))
    if legacy_username and legacy_password:
        return [{"username": legacy_username, "password": legacy_password}]
    return []


def get_login_accounts() -> list[dict[str, str]]:
    payload = _load_auth_file()
    accounts = _normalize_accounts(payload)
    if accounts:
        return accounts

    env_username = os.environ.get("PLAYER_WEB_LOGIN_USERNAME", "").strip()
    env_password = os.environ.get("PLAYER_WEB_LOGIN_PASSWORD", "")
    if env_username and env_password:
        return [{"username": env_username, "password": env_password}]

    return [{"username": DEFAULT_LOGIN_USERNAME, "password": DEFAULT_LOGIN_PASSWORD}]


def get_primary_login_username() -> str:
    accounts = get_login_accounts()
    if accounts:
        return accounts[0]["username"]
    return DEFAULT_LOGIN_USERNAME


def is_valid_login(username: str, password: str) -> bool:
    for account in get_login_accounts():
        if username == account["username"] and password == account["password"]:
            return True
    return False


def get_session_secret() -> str:
    return _read_value("sessionSecret", "PLAYER_WEB_SESSION_SECRET", DEFAULT_SESSION_SECRET)
