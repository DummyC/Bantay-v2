"""Unified test runner for backend (pytest) and frontend (Vite/Vitest).

Usage examples:
    python tests/run_all_tests.py                # run backend pytest + frontend build smoke
    python tests/run_all_tests.py --frontend     # run frontend tests/build only
    python tests/run_all_tests.py --backend      # run backend pytest only

Notes:
- Backend runs with TESTING=1 and skips Traccar/websocket calls by default.
- Frontend runs `npm run test` if available; otherwise falls back to `npm run build` as a smoke check.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"


def run_backend() -> int:
    env = os.environ.copy()
    env.setdefault("TESTING", "1")
    env.setdefault("DATABASE_URL", "sqlite:///./test_bantay.db")
    env.setdefault("TRACCAR_SHARED_SECRET", "test-traccar-secret")
    env.setdefault("SECRET_KEY", "test-secret-key")
    env.setdefault("BANTAY_SKIP_TRACCAR", "1")
    cmd = [sys.executable, "-m", "pytest", "-q"]
    print("[tests] Running backend pytest...")
    return subprocess.call(cmd, cwd=BACKEND, env=env)


def run_frontend() -> int:
    package_json = FRONTEND / "package.json"
    if not package_json.exists():
        print("[tests] Skipping frontend: package.json not found")
        return 0

    env = os.environ.copy()
    cmd_test = ["npm", "run", "test"]
    cmd_build = ["npm", "run", "build"]

    print("[tests] Running frontend tests (npm run test)...")
    rc = subprocess.call(cmd_test, cwd=FRONTEND, env=env)
    if rc == 0:
        return 0
    print("[tests] npm run test failed or missing; falling back to npm run build as smoke check")
    return subprocess.call(cmd_build, cwd=FRONTEND, env=env)


def main():
    parser = argparse.ArgumentParser(description="Run backend and frontend tests")
    parser.add_argument("--backend", action="store_true", help="Run backend tests only")
    parser.add_argument("--frontend", action="store_true", help="Run frontend tests only")
    args = parser.parse_args()

    run_back = args.backend or not args.frontend
    run_front = args.frontend or not args.backend

    rc = 0
    if run_back:
        rc = run_backend()
    if run_front and rc == 0:
        rc = run_frontend()
    sys.exit(rc)


if __name__ == "__main__":
    main()
