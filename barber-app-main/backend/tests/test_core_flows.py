"""Regression coverage for authentication, scheduling, booking, stock, and staff flows."""
import os
from datetime import date, timedelta

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def api():
    if not BASE_URL:
        pytest.fail("REACT_APP_BACKEND_URL is required")
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin(api):
    response = api.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@imperial.com", "password": "Imperial123!"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["role"] == "ADMIN"
    assert body["token"]
    return body["token"]


@pytest.fixture(scope="module")
def client(api):
    email = f"test_{os.getpid()}@example.com"
    response = api.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "Testpass123!", "name": "TEST Cliente", "hair_type": "CACHEADO"
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["role"] == "CLIENT"
    assert body["user"]["hair_type"] == "CACHEADO"
    return body["token"], body["user"]


def test_catalog_and_slots(api):
    catalog = api.get(f"{BASE_URL}/api/catalog")
    assert catalog.status_code == 200
    body = catalog.json()
    assert all(body[key] for key in ("services", "barbers", "products", "courtesies"))
    service, barber = body["services"][0], body["barbers"][0]
    target = date.today() + timedelta(days=1)
    while target.weekday() > 5:
        target += timedelta(days=1)
    slots = api.get(f"{BASE_URL}/api/slots", params={"barber_id": barber["id"], "service_id": service["id"], "appointment_date": target.isoformat()})
    assert slots.status_code == 200
    assert isinstance(slots.json(), list)
    if slots.json():
        assert all(len(item) == 5 and item[2] == ":" for item in slots.json())
        assert slots.json() == sorted(slots.json())


def test_protected_endpoints_require_auth(api):
    assert api.get(f"{BASE_URL}/api/auth/me").status_code == 401
    assert api.get(f"{BASE_URL}/api/appointments/mine").status_code == 401
    assert api.get(f"{BASE_URL}/api/admin/appointments").status_code == 401


def test_client_cannot_access_admin(api, client):
    token, _ = client
    response = api.get(f"{BASE_URL}/api/admin/reports", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_users_and_catalog_include_shop_scope(api, admin):
    me = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {admin}"}).json()
    assert me["shop_id"]

    catalog = api.get(f"{BASE_URL}/api/catalog").json()
    assert all(item.get("shop_id") for item in catalog["services"])
    assert all(item.get("shop_id") for item in catalog["products"])
    assert all(item.get("shop_id") for item in catalog["barbers"])


def test_admin_can_manage_barbers(api, admin):
    staff_headers = {"Authorization": f"Bearer {admin}"}
    create = api.post(f"{BASE_URL}/api/admin/barbers", headers=staff_headers, json={
        "name": "Barbeiro Teste",
        "email": f"teste_{os.getpid()}@imperial.com",
        "password": "Imperial123!"
    })
    assert create.status_code == 200, create.text
    barber = create.json()
    assert barber["role"] == "BARBER"
    assert barber["is_active"] is True

    catalog = api.get(f"{BASE_URL}/api/catalog").json()
    assert any(item["id"] == barber["id"] for item in catalog["barbers"])

    toggle = api.patch(f"{BASE_URL}/api/admin/barbers/{barber['id']}", headers=staff_headers, json={"is_active": False})
    assert toggle.status_code == 200, toggle.text
    assert toggle.json()["is_active"] is False

    catalog_after = api.get(f"{BASE_URL}/api/catalog").json()
    assert all(item["id"] != barber["id"] for item in catalog_after["barbers"])


def test_admin_can_manage_services_but_barber_cannot(api, admin):
    headers = {"Authorization": f"Bearer {admin}"}
    create = api.post(f"{BASE_URL}/api/admin/services", headers=headers, json={
        "name": f"Serviço Teste {os.getpid()}",
        "price": 65,
        "duration_minutes": 45,
        "is_active": True,
    })
    assert create.status_code == 200, create.text
    service = create.json()
    assert service["shop_id"]
    assert any(item["id"] == service["id"] for item in api.get(f"{BASE_URL}/api/admin/services", headers=headers).json())

    barber_login = api.post(f"{BASE_URL}/api/auth/login", json={"email": "barbeiro@imperial.com", "password": "Imperial123!"})
    assert barber_login.status_code == 200, barber_login.text
    barber_headers = {"Authorization": f"Bearer {barber_login.json()['token']}"}
    forbidden = api.post(f"{BASE_URL}/api/admin/services", headers=barber_headers, json={
        "name": "Serviço não permitido", "price": 10, "duration_minutes": 30, "is_active": True,
    })
    assert forbidden.status_code == 403


def test_barber_sees_only_own_schedule(api, admin):
    admin_headers = {"Authorization": f"Bearer {admin}"}
    email = f"barber_scope_{os.getpid()}@example.com"
    create = api.post(f"{BASE_URL}/api/admin/barbers", headers=admin_headers, json={
        "name": "Barbeiro Escopo",
        "email": email,
        "password": "Teste123!",
    })
    assert create.status_code == 200, create.text
    created_barber = create.json()

    schedules_for_admin = api.get(f"{BASE_URL}/api/admin/schedules", headers=admin_headers)
    assert schedules_for_admin.status_code == 200
    assert len(schedules_for_admin.json()["barbers"]) >= 2

    login = api.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "Teste123!"})
    assert login.status_code == 200, login.text
    barber_headers = {"Authorization": f"Bearer {login.json()['token']}"}
    schedules_for_barber = api.get(f"{BASE_URL}/api/admin/schedules", headers=barber_headers)
    assert schedules_for_barber.status_code == 200
    own_data = schedules_for_barber.json()
    assert [item["id"] for item in own_data["barbers"]] == [created_barber["id"]]
    assert all(item["barber_id"] == created_barber["id"] for item in own_data["schedules"])

    other_barber_id = next(
        item["id"]
        for item in schedules_for_admin.json()["barbers"]
        if item["id"] != created_barber["id"]
    )
    forbidden = api.put(f"{BASE_URL}/api/admin/schedules/{other_barber_id}/0", headers=barber_headers, json={
        "start_time": "09:00", "end_time": "18:00", "is_working": True,
    })
    assert forbidden.status_code == 404


def test_booking_stock_admin_completion_and_loyalty(api, client, admin):
    token, user = client
    headers = {"Authorization": f"Bearer {token}"}
    catalog = api.get(f"{BASE_URL}/api/catalog").json()
    service = catalog["services"][0]
    product = next((p for p in catalog["products"] if p["target_hair_type"] == user["hair_type"]), None)
    if not product:
        created_product = api.post(f"{BASE_URL}/api/admin/products", headers={"Authorization": f"Bearer {admin}"}, json={
            "name": f"Produto Teste {os.getpid()}",
            "image_url": "",
            "price": 20,
            "cost_price": 10,
            "stock_quantity": 10,
            "target_hair_type": user["hair_type"],
        })
        assert created_product.status_code == 200, created_product.text
        product = created_product.json()
    target = date.today() + timedelta(days=1)
    while target.weekday() > 5:
        target += timedelta(days=1)
    barber = next((b for b in catalog["barbers"] if api.get(f"{BASE_URL}/api/slots", params={"barber_id": b["id"], "service_id": service["id"], "appointment_date": target.isoformat()}).json()), None)
    assert barber
    slots = api.get(f"{BASE_URL}/api/slots", params={"barber_id": barber["id"], "service_id": service["id"], "appointment_date": target.isoformat()}).json()
    assert slots
    before = product["stock_quantity"]
    booking = api.post(f"{BASE_URL}/api/appointments", headers=headers, json={
        "barber_id": barber["id"], "service_id": service["id"], "appointment_date": target.isoformat(),
        "start_time": slots[0], "product_ids": [product["id"]], "payment_method": "IN_PERSON"
    })
    assert booking.status_code == 200, booking.text
    appointment = booking.json()
    assert appointment["payment_status"] == "IN_PERSON"
    assert appointment["total"] == round(service["price"] + product["price"] * 0.9, 2)
    mine = api.get(f"{BASE_URL}/api/appointments/mine", headers=headers).json()
    assert any(item["id"] == appointment["id"] for item in mine)
    current_product = next(p for p in api.get(f"{BASE_URL}/api/catalog").json()["products"] if p["id"] == product["id"])
    assert current_product["stock_quantity"] == before - 1
    staff_headers = {"Authorization": f"Bearer {admin}"}
    agenda = api.get(f"{BASE_URL}/api/admin/appointments", headers=staff_headers).json()
    assert any(item["id"] == appointment["id"] for item in agenda)
    complete = api.post(f"{BASE_URL}/api/admin/appointments/{appointment['id']}/complete", headers=staff_headers)
    assert complete.status_code == 200
    loyalty = api.get(f"{BASE_URL}/api/loyalty", headers=headers).json()
    assert loyalty["stamps"] == 1