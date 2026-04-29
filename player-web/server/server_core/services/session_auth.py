from __future__ import annotations

from flask import session


AUTH_FLAG_KEY = "player_web_authenticated"
AUTH_USERNAME_KEY = "player_web_username"


def is_authenticated() -> bool:
    return bool(session.get(AUTH_FLAG_KEY))


def get_authenticated_username(default: str = "") -> str:
    username = str(session.get(AUTH_USERNAME_KEY) or "").strip()
    return username or default
