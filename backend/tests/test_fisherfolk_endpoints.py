import uuid
from datetime import datetime, timezone, timedelta

from db.session import SessionLocal
from models.device import Device
from models.fisherfolk import Fisherfolk
from models.geofence import Geofence
from models.position import Position


def _auth_header(client, email, password):
  resp = client.post("/api/auth/login", json={"email": email, "password": password})
  assert resp.status_code == 200
  token = resp.json()["access_token"]
  return {"Authorization": f"Bearer {token}"}


def _seed_fisher_data(db, fisher):
  gf = Geofence(name=f"Test Geofence {uuid.uuid4()}", area="POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))")
  db.add(gf)
  db.commit()
  db.refresh(gf)

  device = Device(unique_id=f"FISH-{uuid.uuid4()}", name="Fisher Device", user_id=fisher.id, geofence_id=gf.id)
  db.add(device)
  db.commit()
  db.refresh(device)

  now = datetime.now(timezone.utc)
  pos = Position(device_id=device.id, latitude=10.0, longitude=120.0, speed=4.0, timestamp=now - timedelta(minutes=5))
  db.add(pos)
  db.commit()
  return device.id, gf.id


def _ensure_settings(db, fisher, allow_history=False, med=None):
  settings = db.query(Fisherfolk).filter(Fisherfolk.user_id == fisher.id).first()
  if not settings:
    settings = Fisherfolk(user_id=fisher.id, allow_history_access=allow_history, medical_record=med)
    db.add(settings)
    db.commit()
    db.refresh(settings)
  return settings


def test_fisherfolk_settings_and_medical_record(client, fisher_user):
  db = SessionLocal()
  try:
    _ensure_settings(db, fisher_user, allow_history=False, med=None)
  finally:
    db.close()

  headers = _auth_header(client, email=fisher_user.email, password="fishpass")

  # get settings default
  resp = client.get("/api/fisherfolk/settings", headers=headers)
  assert resp.status_code == 200
  data = resp.json()
  assert data["allow_history_access"] is False

  # update history permission
  resp = client.put("/api/fisherfolk/settings/history_permission", json={"allow_history_access": True}, headers=headers)
  assert resp.status_code == 200
  assert resp.json()["allow_history_access"] is True

  # set medical record
  med_note = "No known conditions"
  resp = client.put("/api/fisherfolk/settings/medical_record", json={"medical_record": med_note}, headers=headers)
  assert resp.status_code == 200
  assert resp.json()["medical_record"] == med_note

  # profile should now exist
  profile = client.get("/api/fisherfolk/profile", headers=headers)
  assert profile.status_code == 200
  assert profile.json().get("medical_record") == med_note


def test_fisherfolk_devices_geofences_and_history(client, fisher_user):
  db = SessionLocal()
  try:
    device_id, geofence_id = _seed_fisher_data(db, fisher_user)
    _ensure_settings(db, fisher_user, allow_history=True, med="Fit")
  finally:
    db.close()

  headers = _auth_header(client, email=fisher_user.email, password="fishpass")

  resp = client.get("/api/fisherfolk/devices", headers=headers)
  assert resp.status_code == 200
  ids = {d["id"] for d in resp.json()}
  assert device_id in ids

  resp = client.get("/api/fisherfolk/geofences", headers=headers)
  assert resp.status_code == 200
  gids = {g["id"] for g in resp.json()}
  assert geofence_id in gids

  hist = client.get(f"/api/fisherfolk/history?device_id={device_id}", headers=headers)
  assert hist.status_code == 200
  body = hist.json()
  assert isinstance(body, list)
  assert len(body) >= 1
  assert body[0]["device_id"] == device_id