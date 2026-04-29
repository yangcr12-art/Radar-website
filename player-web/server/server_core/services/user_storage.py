from __future__ import annotations

import shutil
from pathlib import Path

from server_core.services.auth_config import get_login_accounts


APP_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = APP_DIR / "data"
USERS_DIR = DATA_DIR / "users"

MANAGED_DATA_FILES = (
    "state.json",
    "state.json.bak",
    "player_dataset.json",
    "player_dataset.json.bak",
    "player_datasets_index.json",
    "player_datasets_index.json.bak",
    "match_datasets_index.json",
    "match_datasets_index.json.bak",
    "fitness_datasets_index.json",
    "fitness_datasets_index.json.bak",
    "opta_datasets_index.json",
    "opta_datasets_index.json.bak",
    "csl_standings_datasets_index.json",
    "csl_standings_datasets_index.json.bak",
)

MANAGED_DATA_DIRS = (
    "player_datasets",
    "match_datasets",
    "fitness_datasets",
    "opta_datasets",
    "csl_standings_datasets",
)


def normalize_username(username: str) -> str:
    text = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in str(username or "").strip())
    text = text.strip("._")
    return text or "guest"


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    USERS_DIR.mkdir(parents=True, exist_ok=True)


def user_data_dir(username: str) -> Path:
    ensure_data_dir()
    return USERS_DIR / normalize_username(username)


def ensure_user_data_dir(username: str) -> Path:
    path = user_data_dir(username)
    path.mkdir(parents=True, exist_ok=True)
    return path


def user_data_file(username: str, filename: str) -> Path:
    return ensure_user_data_dir(username) / filename


def user_data_subdir(username: str, dirname: str) -> Path:
    path = ensure_user_data_dir(username) / dirname
    path.mkdir(parents=True, exist_ok=True)
    return path


def _legacy_data_exists() -> bool:
    for name in MANAGED_DATA_FILES:
        if (DATA_DIR / name).exists():
            return True
    for name in MANAGED_DATA_DIRS:
        if (DATA_DIR / name).exists():
            return True
    return False


def _user_has_managed_data(username: str) -> bool:
    root = ensure_user_data_dir(username)
    for name in MANAGED_DATA_FILES:
        if (root / name).exists():
            return True
    for name in MANAGED_DATA_DIRS:
        if (root / name).exists():
            return True
    return False


def _copy_legacy_entry(target_root: Path, name: str) -> None:
    src = DATA_DIR / name
    dst = target_root / name
    if not src.exists() or dst.exists():
        return
    if src.is_dir():
        shutil.copytree(src, dst)
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def initialize_user_storage() -> None:
    ensure_data_dir()
    if not _legacy_data_exists():
        return

    usernames: list[str] = []
    seen: set[str] = set()
    for account in get_login_accounts():
        username = normalize_username(account.get("username", ""))
        if username in seen:
            continue
        seen.add(username)
        usernames.append(username)

    for username in usernames:
        if _user_has_managed_data(username):
            continue
        target_root = ensure_user_data_dir(username)
        for name in MANAGED_DATA_FILES:
            _copy_legacy_entry(target_root, name)
        for name in MANAGED_DATA_DIRS:
            _copy_legacy_entry(target_root, name)
