#!/usr/bin/env python
"""
Daily database backup script.
Runs pg_dump and stores timestamped .sql files in backend/backups/.
Keeps only the last 7 backups (1 week rolling window).

Schedule via Windows Task Scheduler:
  Action: python "C:\\...\\Analyser\\backend\\backup.py"
  Trigger: Daily at 02:00
"""
import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

# Load .env from the backend directory
sys.path.insert(0, os.path.dirname(__file__))
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

DB_URL     = os.getenv("DATABASE_URL", "")
BACKUP_DIR = Path(__file__).parent / "backups"
KEEP_LAST  = 7  # rolling days


def run_backup():
    if not DB_URL:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)

    BACKUP_DIR.mkdir(exist_ok=True)

    parsed    = urlparse(DB_URL)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file  = BACKUP_DIR / f"nia_backup_{timestamp}.sql"

    env = os.environ.copy()
    env["PGPASSWORD"] = parsed.password or ""

    cmd = [
        "pg_dump",
        "-h", parsed.hostname or "localhost",
        "-p", str(parsed.port or 5432),
        "-U", parsed.username or "postgres",
        "-d", parsed.path.lstrip("/"),
        "-f", str(out_file),
        "--no-password",
        "--verbose",
    ]

    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Starting backup → {out_file.name}")
    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode == 0:
            size_kb = out_file.stat().st_size // 1024
            print(f"  Backup complete: {size_kb} KB")

            # Purge old backups beyond KEEP_LAST
            all_backups = sorted(BACKUP_DIR.glob("nia_backup_*.sql"))
            for old in all_backups[:-KEEP_LAST]:
                old.unlink()
                print(f"  Deleted old backup: {old.name}")
        else:
            print(f"  pg_dump failed:\n{result.stderr}", file=sys.stderr)
            sys.exit(1)
    except FileNotFoundError:
        print(
            "  ERROR: pg_dump not found.\n"
            "  Install PostgreSQL and ensure it is in your PATH.",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    run_backup()
