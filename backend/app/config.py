from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Settings:
    project_root: Path
    data_dir: Path
    database_path: Path
    master_key_path: Path
    legacy_json_path: Path
    host: str
    port: int
    telegram_poll_timeout: int
    scheduler_interval: float
    scheduler_catch_up_hours: int
    scheduler_stale_minutes: int
    slack_socket_enabled: bool
    labs_enabled: bool

    @property
    def database_url(self) -> str:
        return f"sqlite+pysqlite:///{self.database_path.resolve().as_posix()}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    backend_root = Path(__file__).resolve().parents[1]
    project_root = backend_root.parent
    configured_data_dir = os.getenv("SOCIUM_DATA_DIR", "").strip()
    data_dir = (
        Path(configured_data_dir).expanduser().resolve() if configured_data_dir else project_root / "data"
    )
    host = os.getenv("SOCIUM_API_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.getenv("SOCIUM_API_PORT", "8000"))
    poll_timeout = max(5, min(int(os.getenv("SOCIUM_TELEGRAM_POLL_TIMEOUT", "25")), 50))
    scheduler_interval = max(0.1, min(float(os.getenv("SOCIUM_SCHEDULER_INTERVAL", "1")), 10))
    scheduler_catch_up_hours = max(1, min(int(os.getenv("SOCIUM_SCHEDULER_CATCH_UP_HOURS", "24")), 168))
    scheduler_stale_minutes = max(1, min(int(os.getenv("SOCIUM_SCHEDULER_STALE_MINUTES", "10")), 60))
    slack_socket_enabled = os.getenv("SOCIUM_SLACK_SOCKET_MODE", "1").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    labs_enabled = os.getenv("SOCIUM_ENABLE_LABS", "0").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    return Settings(
        project_root=project_root,
        data_dir=data_dir,
        database_path=data_dir / "socium.db",
        master_key_path=data_dir / "master.key",
        legacy_json_path=data_dir / "socium.json",
        host=host,
        port=port,
        telegram_poll_timeout=poll_timeout,
        scheduler_interval=scheduler_interval,
        scheduler_catch_up_hours=scheduler_catch_up_hours,
        scheduler_stale_minutes=scheduler_stale_minutes,
        slack_socket_enabled=slack_socket_enabled,
        labs_enabled=labs_enabled,
    )
