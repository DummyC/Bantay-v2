# Bantay (Fisherfolk Safety System)

Lightweight FastAPI backend for the Fisherfolk Safety System (Traccar integration,
JWT auth, WebSocket events, device/user management).

## Quick start

1. Open a terminal and enter the backend folder:

```bash
cd backend
```

2. Create and activate a virtual environment (zsh):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

3. Configure environment variables (create a `.env` file or export in shell).
Minimum useful variables:

- `DATABASE_URL` (default: `sqlite:///./bantay.db`)
- `SECRET_KEY` (JWT secret)
- `TRACCAR_API_URL` and `TRACCAR_API_TOKEN` (for device registration)
- `TRACCAR_SHARED_SECRET` (for incoming webhook verification)
- `TESTING` (set to `1` to enable testing/dev fallbacks)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` (defaults provided)
- `ADMIN_CREATE_ON_STARTUP` (true/false)
- `PASSWORD_SCHEME` (`auto`, `bcrypt`, `argon2`, `plaintext`)
- `BANTAY_SKIP_TRACCAR` (set `1` to skip Traccar API calls)

Example `.env` (development):

```
DATABASE_URL=sqlite:///./bantay.db
SECRET_KEY=dev-secret
TRACCAR_SHARED_SECRET=replace-me
TESTING=1
ADMIN_CREATE_ON_STARTUP=true
PASSWORD_SCHEME=auto
```

4. Apply database migrations (if using Alembic):

```bash
# from backend/
alembic upgrade head
```

5. Run the server (development):

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API will be available at `http://127.0.0.1:8000` and OpenAPI at
`http://127.0.0.1:8000/docs`.

## Tests

Activate the venv and run:

```bash
source .venv/bin/activate
PYTHONPATH=. pytest -q
```

Notes: tests create file-backed temporary SQLite databases so they are safe to
run locally. Set `TESTING=1` in your environment to enable test-friendly
behavior (plaintext hash scheme, skipping Traccar where appropriate).

## Curl examples (login)

Basic login request:

```bash
curl -i -X POST "http://127.0.0.1:8000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"adminpass"}'
```

Extract token with `jq`:

```bash
TOKEN=$(curl -s -X POST "http://127.0.0.1:8000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"adminpass"}' | jq -r .access_token)
echo "$TOKEN"
```

Use token in a request:

```bash
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/admin/users
```

## Password backend and troubleshooting

- The app prefers secure password schemes (`bcrypt` or `argon2`) but will
  fall back to `plaintext` if a secure backend is not available. Falling back
  to plaintext is acceptable for local development/tests but insecure for
  production.
- To install a working bcrypt backend in a Linux environment:

```bash
sudo apt-get update
sudo apt-get install build-essential libffi-dev python3-dev
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install bcrypt
```

- To use Argon2 instead (recommended alternative), install and set the
  scheme:

```bash
source .venv/bin/activate
pip install argon2-cffi
# then in .env or environment: PASSWORD_SCHEME=argon2
```

## Notes and next steps

- `ADMIN_CREATE_ON_STARTUP` controls whether a default admin is created at
  server startup. Set it to `false` on production servers if you manage users
  manually.
- `PASSWORD_SCHEME` can be set to `auto` (default) to try `bcrypt` then
  `argon2`, or explicitly to `bcrypt`/`argon2`/`plaintext`.
- If you want, I can add a small systemd/Procfile example to run the server in
  production or help switch defaults to `argon2`.

Happy hacking — open an issue or ask if you want setup tailored to a cloud
provider or container image.
