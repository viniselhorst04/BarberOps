from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from pathlib import Path
from datetime import datetime, timezone, date, timedelta
from typing import Optional, List
import os, uuid, bcrypt, jwt, logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = mongo[os.environ["DB_NAME"]]
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET must be configured")
app = FastAPI(title="Barbearia Imperial API")
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)

class AuthInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)

class RegisterInput(AuthInput):
    name: str = Field(min_length=2, max_length=80)
    hair_type: str = Field(pattern="^(LISO|ONDULADO|CACHEADO|CRESPO)$")

class ServiceInput(BaseModel):
    name: str = Field(min_length=2)
    price: float = Field(gt=0)
    duration_minutes: int = Field(gt=0, le=240)
    is_active: bool = True

class ProductInput(BaseModel):
    name: str = Field(min_length=2)
    image_url: str = ""
    price: float = Field(gt=0)
    cost_price: float = Field(ge=0)
    stock_quantity: int = Field(ge=0)
    target_hair_type: str = Field(pattern="^(LISO|ONDULADO|CACHEADO|CRESPO)$")

class CourtesyInput(BaseModel):
    name: str = Field(min_length=2)
    is_active: bool = True

class ScheduleInput(BaseModel):
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    is_working: bool = True

class ShopHoursInput(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    is_working: bool = True

class ScheduleExceptionInput(ScheduleInput):
    barber_id: str
    exception_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    reason: str = Field(default="", max_length=120)

class BarberCreateInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=80)
    is_active: bool = True

class BarberUpdateInput(BaseModel):
    is_active: Optional[bool] = None

class ShopCreateInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    slug: str = Field(pattern=r"^[a-z0-9-]+$", min_length=2, max_length=60)
    admin_name: str = Field(min_length=2, max_length=80)
    admin_email: EmailStr
    admin_password: str = Field(min_length=6, max_length=80)
    postal_code: Optional[str] = Field(default=None, max_length=20)
    street: Optional[str] = Field(default=None, max_length=120)
    number: Optional[str] = Field(default=None, max_length=20)
    complement: Optional[str] = Field(default=None, max_length=80)
    neighborhood: Optional[str] = Field(default=None, max_length=80)
    city: Optional[str] = Field(default=None, max_length=80)
    state: Optional[str] = Field(default=None, max_length=80)
    country: Optional[str] = Field(default="Brasil", max_length=80)

class ShopUpdateInput(BaseModel):
    is_active: Optional[bool] = None
    postal_code: Optional[str] = Field(default=None, max_length=20)
    street: Optional[str] = Field(default=None, max_length=120)
    number: Optional[str] = Field(default=None, max_length=20)
    complement: Optional[str] = Field(default=None, max_length=80)
    neighborhood: Optional[str] = Field(default=None, max_length=80)
    city: Optional[str] = Field(default=None, max_length=80)
    state: Optional[str] = Field(default=None, max_length=80)
    country: Optional[str] = Field(default=None, max_length=80)

class ShopAddressUpdateInput(BaseModel):
    postal_code: Optional[str] = Field(default=None, max_length=20)
    street: Optional[str] = Field(default=None, max_length=120)
    number: Optional[str] = Field(default=None, max_length=20)
    complement: Optional[str] = Field(default=None, max_length=80)
    neighborhood: Optional[str] = Field(default=None, max_length=80)
    city: Optional[str] = Field(default=None, max_length=80)
    state: Optional[str] = Field(default=None, max_length=80)
    country: Optional[str] = Field(default=None, max_length=80)

class AppointmentInput(BaseModel):
    barber_id: str
    service_id: str
    appointment_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    courtesy_id: Optional[str] = None
    product_ids: List[str] = Field(default_factory=list)
    payment_method: str = Field(pattern="^(IN_PERSON|PIX_APP)$")

class AppointmentRescheduleInput(BaseModel):
    appointment_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")

def public_user(u: dict):
    return {k: u.get(k) for k in ["id", "name", "email", "role", "hair_type", "loyalty_stamps", "shop_id"]}

def password_hash(value: str):
    return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()

def token_for(user_id: str):
    return jwt.encode({"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(hours=12)}, JWT_SECRET, algorithm="HS256")

async def current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Faça login para continuar")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user: raise HTTPException(401, "Usuário não encontrado")
        if user.get("shop_id") is None and user.get("role") in ["ADMIN", "BARBER"]:
            shop_id = await default_shop_id()
            await db.users.update_one({"id": user["id"]}, {"$set": {"shop_id": shop_id}})
            user["shop_id"] = shop_id
        if user.get("role") in ["ADMIN", "BARBER"] and not await db.shops.find_one({"id": user.get("shop_id"), "is_active": True}, {"_id": 0, "id": 1}):
            raise HTTPException(403, "A barbearia está desativada")
        return user
    except jwt.PyJWTError:
        raise HTTPException(401, "Sessão expirada")

async def staff_only(user=Depends(current_user)):
    if user["role"] not in ["ADMIN", "BARBER"]: raise HTTPException(403, "Acesso exclusivo da equipe")
    return user

async def admin_only(user=Depends(current_user)):
    if user["role"] != "ADMIN": raise HTTPException(403, "Acesso exclusivo do administrador")
    return user

async def platform_only(user=Depends(current_user)):
    if user["role"] != "PLATFORM_ADMIN": raise HTTPException(403, "Acesso exclusivo da plataforma")
    return user

async def default_shop_id():
    shop = await db.shops.find_one({"slug": "imperial"}, {"_id": 0, "id": 1})
    if shop:
        return shop["id"]
    shop_id = str(uuid.uuid4())
    await db.shops.insert_one({"id": shop_id, "name": "Imperial Barbearia", "slug": "imperial", "is_active": True})
    return shop_id

async def ensure_barber_schedule(barber_id: str):
    for day in range(7):
        await db.schedules.update_one(
            {"barber_id": barber_id, "day_of_week": day},
            {"$set": {"id": str(uuid.uuid4()), "barber_id": barber_id, "day_of_week": day, "start_time": "09:00", "end_time": "18:00", "is_working": day < 6}},
            upsert=True,
        )

async def seed_data():
    # Remove órfãos de rodadas antigas com domínio .test (não é aceito pelo Pydantic EmailStr)
    stale = [u["id"] async for u in db.users.find({"email": {"$regex": r"\.test$"}}, {"_id": 0, "id": 1})]
    if stale:
        await db.users.delete_many({"id": {"$in": stale}})
        await db.schedules.delete_many({"barber_id": {"$in": stale}})
    shop_id = await default_shop_id()
    await db.users.create_index("email", unique=True)
    await db.users.update_many({"shop_id": {"$exists": False}}, {"$set": {"shop_id": None}})
    await db.users.update_many({"role": "BARBER"}, {"$set": {"is_active": True, "shop_id": shop_id}})
    await db.users.update_many({"role": "ADMIN", "shop_id": {"$in": [None, ""]}}, {"$set": {"shop_id": shop_id}})
    await db.services.update_many({"shop_id": {"$exists": False}}, {"$set": {"shop_id": shop_id}})
    await db.products.update_many({"shop_id": {"$exists": False}}, {"$set": {"shop_id": shop_id}})
    await db.courtesies.update_many({"shop_id": {"$exists": False}}, {"$set": {"shop_id": shop_id}})
    await db.appointments.update_many({"shop_id": {"$exists": False}}, {"$set": {"shop_id": shop_id}})
    for email, role, name in [(os.environ.get("ADMIN_EMAIL", "admin@imperial.com"), "ADMIN", "Admin Imperial"), ("barbeiro@imperial.com", "BARBER", "Rafael Barbeiro")]:
        await db.users.update_one(
            {"email": email},
            {"$setOnInsert": {"id": str(uuid.uuid4()), "name": name, "email": email, "password_hash": password_hash(os.environ.get("ADMIN_PASSWORD", "Imperial123!")), "role": role, "hair_type": None, "loyalty_stamps": 0, "is_active": True}, "$set": {"shop_id": shop_id}},
            upsert=True,
        )
    platform_email = os.environ.get("PLATFORM_ADMIN_EMAIL")
    platform_password = os.environ.get("PLATFORM_ADMIN_PASSWORD")
    if platform_email and platform_password:
        await db.users.update_one(
            {"email": platform_email.lower()},
            {"$setOnInsert": {"id": str(uuid.uuid4()), "name": "Administrador da Plataforma", "email": platform_email.lower(), "password_hash": password_hash(platform_password), "role": "PLATFORM_ADMIN", "hair_type": None, "loyalty_stamps": 0, "is_active": True, "shop_id": None}},
            upsert=True,
        )
    if await db.services.count_documents({}) == 0:
        await db.services.insert_many([{"id": str(uuid.uuid4()), "name": "Corte Imperial", "price": 55, "duration_minutes": 45, "is_active": True, "shop_id": shop_id}, {"id": str(uuid.uuid4()), "name": "Corte + Barba", "price": 85, "duration_minutes": 75, "is_active": True, "shop_id": shop_id}, {"id": str(uuid.uuid4()), "name": "Barba Tradicional", "price": 40, "duration_minutes": 30, "is_active": True, "shop_id": shop_id}])
    if await db.products.count_documents({}) == 0:
        await db.products.insert_many([{"id": str(uuid.uuid4()), "name": "Pomada Matte Imperial", "image_url": "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=500", "price": 49.9, "cost_price": 22, "stock_quantity": 14, "target_hair_type": "LISO", "shop_id": shop_id}, {"id": str(uuid.uuid4()), "name": "Ativador de Cachos", "image_url": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=500", "price": 59.9, "cost_price": 25, "stock_quantity": 9, "target_hair_type": "CACHEADO", "shop_id": shop_id}])
    if await db.courtesies.count_documents({}) == 0:
        await db.courtesies.insert_many([{"id": str(uuid.uuid4()), "name": "Café especial", "is_active": True, "shop_id": shop_id}, {"id": str(uuid.uuid4()), "name": "Água gelada", "is_active": True, "shop_id": shop_id}, {"id": str(uuid.uuid4()), "name": "Bolo do dia", "is_active": True, "shop_id": shop_id}])
    # Garante que TODO barbeiro tenha agenda semanal padrão (Seg-Sáb 09:00-18:00)
    async for barber in db.users.find({"role": "BARBER"}, {"_id": 0, "id": 1}):
        await ensure_barber_schedule(barber["id"])

@app.on_event("startup")
async def startup(): await seed_data()

@api.post("/auth/register")
async def register(data: RegisterInput):
    email = data.email.lower()
    if await db.users.find_one({"email": email}): raise HTTPException(409, "Este e-mail já está cadastrado")
    user = {"id": str(uuid.uuid4()), "name": data.name, "email": email, "password_hash": password_hash(data.password), "role": "CLIENT", "hair_type": data.hair_type, "loyalty_stamps": 0, "shop_id": None}
    await db.users.insert_one(user)
    return {"token": token_for(user["id"]), "user": public_user(user)}

@api.post("/auth/login")
async def login(data: AuthInput):
    user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
    if not user or not bcrypt.checkpw(data.password.encode(), user["password_hash"].encode()): raise HTTPException(401, "E-mail ou senha inválidos")
    if user.get("shop_id") is None and user.get("role") in ["ADMIN", "BARBER"]:
        shop_id = await default_shop_id()
        await db.users.update_one({"id": user["id"]}, {"$set": {"shop_id": shop_id}})
        user["shop_id"] = shop_id
    if user.get("role") in ["ADMIN", "BARBER"] and not await db.shops.find_one({"id": user.get("shop_id"), "is_active": True}, {"_id": 0, "id": 1}):
        raise HTTPException(403, "A barbearia está desativada")
    return {"token": token_for(user["id"]), "user": public_user(user)}

@api.get("/auth/me")
async def me(user=Depends(current_user)): return public_user(user)

@api.get("/shops")
async def shops():
    await default_shop_id()
    result = await db.shops.find({"is_active": True}, {"_id": 0}).sort("name", 1).to_list(100)
    for shop in result:
        shop["opening_hours"] = await db.shop_hours.find({"shop_id": shop["id"]}, {"_id": 0, "shop_id": 0}).sort("day_of_week", 1).to_list(7)
    return result

@api.get("/platform/shops")
async def platform_shops(user=Depends(platform_only)):
    return await db.shops.find({}, {"_id": 0}).sort("name", 1).to_list(100)

@api.post("/platform/shops")
async def create_shop(data: ShopCreateInput, user=Depends(platform_only)):
    if await db.shops.find_one({"slug": data.slug}):
        raise HTTPException(409, "Este identificador já está em uso")
    admin_email = data.admin_email.lower()
    if await db.users.find_one({"email": admin_email}):
        raise HTTPException(409, "Este e-mail já está cadastrado")
    item = {"id": str(uuid.uuid4()), **data.model_dump(), "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()}
    item.pop("admin_name")
    item.pop("admin_email")
    item.pop("admin_password")
    await db.shops.insert_one(item)
    item.pop("_id", None)
    admin = {"id": str(uuid.uuid4()), "name": data.admin_name, "email": admin_email, "password_hash": password_hash(data.admin_password), "role": "ADMIN", "hair_type": None, "loyalty_stamps": 0, "is_active": True, "shop_id": item["id"]}
    await db.users.insert_one(admin)
    return item

@api.patch("/platform/shops/{shop_id}")
async def update_shop(shop_id: str, data: ShopUpdateInput, user=Depends(platform_only)):
    if not await db.shops.find_one({"id": shop_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Barbearia não encontrada")
    changes = data.model_dump(exclude_none=True)
    if changes:
        await db.shops.update_one({"id": shop_id}, {"$set": changes})
    return await db.shops.find_one({"id": shop_id}, {"_id": 0})

@api.get("/catalog")
async def catalog(shop_id: Optional[str] = None):
    shop_id = shop_id or await default_shop_id()
    if not await db.shops.find_one({"id": shop_id, "is_active": True}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Barbearia não encontrada")
    return {"services": await db.services.find({"is_active": True, "shop_id": shop_id}, {"_id": 0}).to_list(100), "products": await db.products.find({"stock_quantity": {"$gt": 0}, "shop_id": shop_id}, {"_id": 0}).to_list(100), "courtesies": await db.courtesies.find({"is_active": True, "shop_id": shop_id}, {"_id": 0}).to_list(100), "barbers": await db.users.find({"role": "BARBER", "is_active": {"$ne": False}, "shop_id": shop_id}, {"_id": 0, "id": 1, "name": 1, "role": 1, "shop_id": 1}).to_list(100)}

@api.get("/slots")
async def slots(barber_id: str, service_id: str, appointment_date: str, exclude_appointment_id: Optional[str] = None):
    barber = await db.users.find_one({"id": barber_id, "role": "BARBER", "is_active": {"$ne": False}}, {"_id": 0, "id": 1, "shop_id": 1})
    if not barber: return []
    service = await db.services.find_one({"id": service_id, "is_active": True, "shop_id": barber.get("shop_id")}, {"_id": 0})
    if not service: raise HTTPException(404, "Serviço indisponível")
    selected = date.fromisoformat(appointment_date)
    schedule = await db.schedules.find_one({"barber_id": barber_id, "day_of_week": selected.weekday()}, {"_id": 0})
    exception = await db.schedule_exceptions.find_one({"barber_id": barber_id, "exception_date": appointment_date}, {"_id": 0})
    if exception:
        schedule = exception
    if not schedule or not schedule.get("is_working"): return []
    shop_schedule = await db.shop_hours.find_one({"shop_id": barber.get("shop_id"), "day_of_week": selected.weekday()}, {"_id": 0})
    if shop_schedule:
        if not shop_schedule.get("is_working"): return []
        schedule = {
            **schedule,
            "start_time": max(schedule["start_time"], shop_schedule["start_time"]),
            "end_time": min(schedule["end_time"], shop_schedule["end_time"]),
        }
        if schedule["start_time"] >= schedule["end_time"]: return []
    booking_query = {"barber_id": barber_id, "appointment_date": appointment_date, "status": {"$nin": ["CANCELLED"]}}
    if exclude_appointment_id:
        booking_query["id"] = {"$ne": exclude_appointment_id}
    bookings = await db.appointments.find(booking_query, {"_id": 0}).to_list(100)
    def mins(t): return int(t[:2]) * 60 + int(t[3:])
    start, end, duration = mins(schedule["start_time"]), mins(schedule["end_time"]), service["duration_minutes"]
    result = []
    for point in range(start, end - duration + 1, 30):
        finish = point + duration
        if all(finish <= mins(b["start_time"]) or point >= mins(b["end_time"]) for b in bookings): result.append(f"{point//60:02d}:{point%60:02d}")
    return result

@api.post("/appointments")
async def create_appointment(data: AppointmentInput, user=Depends(current_user)):
    try:
        selected_date = date.fromisoformat(data.appointment_date)
    except ValueError:
        raise HTTPException(422, "Data inválida")
    if selected_date < date.today():
        raise HTTPException(422, "Não é possível agendar em uma data passada")
    barber = await db.users.find_one({"id": data.barber_id, "role": "BARBER", "is_active": {"$ne": False}}, {"_id": 0, "id": 1, "shop_id": 1})
    if not barber:
        raise HTTPException(404, "Barbeiro não encontrado")
    shop_id = barber.get("shop_id") or await default_shop_id()
    service = await db.services.find_one({"id": data.service_id, "is_active": True, "shop_id": shop_id}, {"_id": 0})
    if not service:
        raise HTTPException(404, "Serviço indisponível")
    if data.courtesy_id and not await db.courtesies.find_one({"id": data.courtesy_id, "is_active": True, "shop_id": shop_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Cortesia indisponível")
    if len(data.product_ids) != len(set(data.product_ids)):
        raise HTTPException(422, "Não repita produtos no agendamento")
    slots_available = await slots(data.barber_id, data.service_id, data.appointment_date)
    if data.start_time not in slots_available: raise HTTPException(409, "Esse horário acabou de ser reservado")
    products = await db.products.find({"id": {"$in": data.product_ids}, "stock_quantity": {"$gt": 0}, "shop_id": shop_id}, {"_id": 0}).to_list(100)
    if len(products) != len(data.product_ids):
        raise HTTPException(409, "Produto indisponível ou sem estoque")
    start = int(data.start_time[:2]) * 60 + int(data.start_time[3:]); end = start + service["duration_minutes"]
    product_total = sum(p["price"] * 0.9 for p in products)
    loyalty_discount = 0.5 if user.get("loyalty_stamps", 0) >= 10 else 0
    total = service["price"] * (1 - loyalty_discount) + product_total
    appt = {"id": str(uuid.uuid4()), "client_id": user["id"], "client_name": user["name"], "barber_id": data.barber_id, "shop_id": shop_id, "service_id": data.service_id, "service_name": service["name"], "service_price": service["price"], "courtesy_id": data.courtesy_id, "product_ids": data.product_ids, "product_total": round(product_total, 2), "appointment_date": data.appointment_date, "start_time": data.start_time, "end_time": f"{end//60:02d}:{end%60:02d}", "status": "CONFIRMED", "payment_method": data.payment_method, "payment_status": "PENDING" if data.payment_method == "PIX_APP" else "IN_PERSON", "total": round(total, 2), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.appointments.insert_one(appt)
    for p in products: await db.products.update_one({"id": p["id"], "shop_id": shop_id}, {"$inc": {"stock_quantity": -1}})
    appt.pop("_id", None)
    return appt

@api.get("/appointments/mine")
async def mine(user=Depends(current_user)):
    appointments = await db.appointments.find({"client_id": user["id"]}, {"_id": 0}).sort("appointment_date", -1).to_list(100)
    for appointment in appointments:
        barber = await db.users.find_one({"id": appointment.get("barber_id")}, {"_id": 0, "name": 1})
        shop = await db.shops.find_one({"id": appointment.get("shop_id")}, {"_id": 0, "name": 1})
        products = await db.products.find({"id": {"$in": appointment.get("product_ids", [])}}, {"_id": 0, "name": 1, "price": 1}).to_list(100)
        appointment["barber_name"] = barber.get("name") if barber else "Barbeiro não informado"
        appointment["shop_name"] = shop.get("name") if shop else "Barbearia não informada"
        appointment["products"] = products
    return appointments

@api.post("/appointments/{appointment_id}/cancel")
async def cancel_appointment(appointment_id: str, user=Depends(current_user)):
    appointment = await db.appointments.find_one({"id": appointment_id, "client_id": user["id"]}, {"_id": 0})
    if not appointment:
        raise HTTPException(404, "Agendamento não encontrado")
    if appointment.get("status") != "CONFIRMED":
        raise HTTPException(409, "Este agendamento não pode mais ser cancelado")
    appointment_at = datetime.fromisoformat(f"{appointment['appointment_date']}T{appointment['start_time']}")
    if appointment_at <= datetime.now():
        raise HTTPException(409, "O prazo para cancelar este agendamento terminou")
    await db.appointments.update_one({"id": appointment_id, "client_id": user["id"], "status": "CONFIRMED"}, {"$set": {"status": "CANCELLED", "cancelled_at": datetime.now(timezone.utc).isoformat()}})
    for product_id in appointment.get("product_ids", []):
        await db.products.update_one({"id": product_id, "shop_id": appointment["shop_id"]}, {"$inc": {"stock_quantity": 1}})
    return await db.appointments.find_one({"id": appointment_id}, {"_id": 0})

@api.patch("/appointments/{appointment_id}/reschedule")
async def reschedule_appointment(appointment_id: str, data: AppointmentRescheduleInput, user=Depends(current_user)):
    appointment = await db.appointments.find_one({"id": appointment_id, "client_id": user["id"]}, {"_id": 0})
    if not appointment:
        raise HTTPException(404, "Agendamento não encontrado")
    if appointment.get("status") != "CONFIRMED":
        raise HTTPException(409, "Este agendamento não pode mais ser remarcado")
    try:
        selected_date = date.fromisoformat(data.appointment_date)
    except ValueError:
        raise HTTPException(422, "Data inválida")
    if selected_date < date.today():
        raise HTTPException(422, "Não é possível remarcar para uma data passada")
    selected_at = datetime.fromisoformat(f"{data.appointment_date}T{data.start_time}")
    if selected_at <= datetime.now():
        raise HTTPException(422, "Escolha um horário futuro")
    available = await slots(appointment["barber_id"], appointment["service_id"], data.appointment_date, appointment_id)
    if data.start_time not in available:
        raise HTTPException(409, "Esse horário não está mais disponível")
    start = int(data.start_time[:2]) * 60 + int(data.start_time[3:])
    duration = appointment["end_time"]
    old_start = int(appointment["start_time"][:2]) * 60 + int(appointment["start_time"][3:])
    end = start + (int(duration[:2]) * 60 + int(duration[3:]) - old_start)
    await db.appointments.update_one({"id": appointment_id, "client_id": user["id"], "status": "CONFIRMED"}, {"$set": {"appointment_date": data.appointment_date, "start_time": data.start_time, "end_time": f"{end//60:02d}:{end%60:02d}", "rescheduled_at": datetime.now(timezone.utc).isoformat()}})
    return await db.appointments.find_one({"id": appointment_id}, {"_id": 0})

@api.get("/loyalty")
async def loyalty(user=Depends(current_user)): return {"stamps": user.get("loyalty_stamps", 0), "goal": 10, "discount_ready": user.get("loyalty_stamps", 0) >= 10}

@api.get("/admin/barbers")
async def admin_barbers(user=Depends(staff_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    return await db.users.find({"role": "BARBER", "shop_id": shop_id}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(100)

@api.get("/admin/shop")
async def admin_shop(user=Depends(admin_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    return await db.shops.find_one({"id": shop_id}, {"_id": 0})

@api.patch("/admin/shop/address")
async def update_admin_shop_address(data: ShopAddressUpdateInput, user=Depends(admin_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    changes = data.model_dump(exclude_none=True)
    if changes:
        await db.shops.update_one({"id": shop_id}, {"$set": changes})
    return await db.shops.find_one({"id": shop_id}, {"_id": 0})

@api.get("/admin/shop/hours")
async def admin_shop_hours(user=Depends(admin_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    return await db.shop_hours.find({"shop_id": shop_id}, {"_id": 0, "shop_id": 0}).sort("day_of_week", 1).to_list(7)

@api.put("/admin/shop/hours/{day_of_week}")
async def update_admin_shop_hours(day_of_week: int, data: ScheduleInput, user=Depends(admin_only)):
    if day_of_week not in range(7):
        raise HTTPException(422, "Dia da semana inválido")
    start = int(data.start_time[:2]) * 60 + int(data.start_time[3:])
    end = int(data.end_time[:2]) * 60 + int(data.end_time[3:])
    if data.is_working and end <= start:
        raise HTTPException(422, "O fim do expediente deve ser depois do início")
    shop_id = user.get("shop_id") or await default_shop_id()
    await db.shop_hours.update_one({"shop_id": shop_id, "day_of_week": day_of_week}, {"$set": {"shop_id": shop_id, "day_of_week": day_of_week, **data.model_dump()}}, upsert=True)
    return {"day_of_week": day_of_week, **data.model_dump()}

@api.post("/admin/barbers")
async def create_barber(data: BarberCreateInput, user=Depends(admin_only)):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Este e-mail já está cadastrado")
    item = {"id": str(uuid.uuid4()), "name": data.name, "email": email, "password_hash": password_hash(data.password), "role": "BARBER", "hair_type": None, "loyalty_stamps": 0, "is_active": data.is_active, "shop_id": user.get("shop_id") or await default_shop_id()}
    await db.users.insert_one(item)
    await ensure_barber_schedule(item["id"])
    item.pop("_id", None)
    item.pop("password_hash", None)
    return item

@api.patch("/admin/barbers/{barber_id}")
async def update_barber(barber_id: str, data: BarberUpdateInput, user=Depends(admin_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    barber = await db.users.find_one({"id": barber_id, "role": "BARBER", "shop_id": shop_id}, {"_id": 0, "password_hash": 0})
    if not barber:
        raise HTTPException(404, "Barbeiro não encontrado")
    if data.is_active is not None:
        await db.users.update_one({"id": barber_id, "shop_id": shop_id}, {"$set": {"is_active": data.is_active}})
    barber = await db.users.find_one({"id": barber_id, "role": "BARBER", "shop_id": shop_id}, {"_id": 0, "password_hash": 0})
    barber.pop("_id", None)
    return barber

@api.get("/admin/appointments")
async def admin_appointments(user=Depends(staff_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    query = {"shop_id": shop_id}
    if user["role"] == "BARBER":
        query["barber_id"] = user["id"]
    return await db.appointments.find(query, {"_id": 0}).sort([("appointment_date", 1), ("start_time", 1)]).to_list(500)

@api.get("/admin/schedules")
async def admin_schedules(user=Depends(staff_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    barber_query = {"role": "BARBER", "shop_id": shop_id}
    if user["role"] == "BARBER":
        barber_query["id"] = user["id"]
    barbers = await db.users.find(barber_query, {"_id": 0, "id": 1, "name": 1, "is_active": 1}).to_list(100)
    schedules = await db.schedules.find({"barber_id": {"$in": [b["id"] for b in barbers]}}, {"_id": 0}).sort([("barber_id", 1), ("day_of_week", 1)]).to_list(1000)
    exceptions = await db.schedule_exceptions.find({"barber_id": {"$in": [b["id"] for b in barbers]}}, {"_id": 0}).sort([("exception_date", 1), ("barber_id", 1)]).to_list(1000)
    return {"barbers": barbers, "schedules": schedules, "exceptions": exceptions}

@api.put("/admin/schedules/{barber_id}/{day_of_week}")
async def update_schedule(barber_id: str, day_of_week: int, data: ScheduleInput, user=Depends(staff_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    if day_of_week not in range(7):
        raise HTTPException(422, "Dia da semana inválido")
    if user["role"] == "BARBER" and barber_id != user["id"]:
        raise HTTPException(404, "Barbeiro não encontrado")
    barber_query = {"id": barber_id, "role": "BARBER", "shop_id": shop_id}
    if user["role"] == "BARBER":
        barber_query["id"] = user["id"]
    if not await db.users.find_one(barber_query, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Barbeiro não encontrado")
    target_barber_id = user["id"] if user["role"] == "BARBER" else barber_id
    start = int(data.start_time[:2]) * 60 + int(data.start_time[3:])
    end = int(data.end_time[:2]) * 60 + int(data.end_time[3:])
    if data.is_working and end <= start:
        raise HTTPException(422, "O fim do expediente deve ser depois do início")
    await db.schedules.update_one({"barber_id": target_barber_id, "day_of_week": day_of_week}, {"$set": {"start_time": data.start_time, "end_time": data.end_time, "is_working": data.is_working}}, upsert=True)
    return {"ok": True}

@api.post("/admin/schedule-exceptions")
async def add_schedule_exception(data: ScheduleExceptionInput, user=Depends(staff_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    barber_query = {"id": data.barber_id, "role": "BARBER", "shop_id": shop_id}
    if user["role"] == "BARBER":
        barber_query["id"] = user["id"]
    if not await db.users.find_one(barber_query, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Barbeiro não encontrado")
    start = int(data.start_time[:2]) * 60 + int(data.start_time[3:])
    end = int(data.end_time[:2]) * 60 + int(data.end_time[3:])
    if data.is_working and end <= start:
        raise HTTPException(422, "O fim do expediente deve ser depois do início")
    item = {"id": str(uuid.uuid4()), **data.model_dump()}
    await db.schedule_exceptions.update_one({"barber_id": data.barber_id, "exception_date": data.exception_date}, {"$set": item}, upsert=True)
    return item

@api.delete("/admin/schedule-exceptions/{exception_id}")
async def delete_schedule_exception(exception_id: str, user=Depends(staff_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    barber_ids = [barber["id"] async for barber in db.users.find({"role": "BARBER", "shop_id": shop_id}, {"_id": 0, "id": 1})]
    result = await db.schedule_exceptions.delete_one({"id": exception_id, "barber_id": {"$in": barber_ids}})
    if not result.deleted_count:
        raise HTTPException(404, "Exceção não encontrada")
    return {"ok": True}

@api.post("/admin/appointments/{appointment_id}/complete")
async def complete(appointment_id: str, user=Depends(staff_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    appointment_query = {"id": appointment_id, "shop_id": shop_id}
    if user["role"] == "BARBER":
        appointment_query["barber_id"] = user["id"]
    appt = await db.appointments.find_one(appointment_query, {"_id": 0})
    if not appt: raise HTTPException(404, "Agendamento não encontrado")
    if appt["status"] == "COMPLETED":
        return {"ok": True, "already_completed": True}
    if appt["status"] == "CANCELLED":
        raise HTTPException(409, "Agendamento cancelado não pode ser concluído")
    appointment_query["status"] = {"$ne": "COMPLETED"}
    updated = await db.appointments.update_one(appointment_query, {"$set": {"status": "COMPLETED"}})
    if updated.modified_count:
        await db.users.update_one({"id": appt["client_id"]}, {"$inc": {"loyalty_stamps": 1}})
    return {"ok": True}

@api.get("/admin/reports")
async def reports(user=Depends(staff_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    report_query = {"status": {"$ne": "CANCELLED"}, "shop_id": shop_id}
    if user["role"] == "BARBER":
        report_query["barber_id"] = user["id"]
    appointments = await db.appointments.find(report_query, {"_id": 0}).to_list(500)
    services = round(sum(a.get("service_price", a.get("total", 0)) for a in appointments), 2)
    products = round(sum(a.get("product_total", 0) for a in appointments), 2)
    gross = round(services + products, 2)
    daily_values = {}
    for appointment in appointments:
        day = appointment.get("appointment_date")
        if not day:
            continue
        daily = daily_values.setdefault(day, {"date": day, "services": 0, "products": 0})
        daily["services"] += appointment.get("service_price", appointment.get("total", 0))
        daily["products"] += appointment.get("product_total", 0)
    daily = [
        {**item, "services": round(item["services"], 2), "products": round(item["products"], 2)}
        for item in sorted(daily_values.values(), key=lambda item: item["date"])
    ]
    return {"gross": gross, "net": round(gross * .78, 2), "services": services, "products": products, "appointments": len(appointments), "daily": daily}

@api.get("/admin/services")
async def admin_services(user=Depends(staff_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    return await db.services.find({"shop_id": shop_id}, {"_id": 0}).sort("name", 1).to_list(100)

@api.post("/admin/services")
async def add_service(data: ServiceInput, user=Depends(admin_only)):
    item = {"id": str(uuid.uuid4()), "shop_id": user.get("shop_id") or await default_shop_id(), **data.model_dump()}
    await db.services.insert_one(item)
    item.pop("_id", None)
    return item

@api.patch("/admin/services/{service_id}")
async def update_service(service_id: str, data: ServiceInput, user=Depends(admin_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    if not await db.services.find_one({"id": service_id, "shop_id": shop_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Serviço não encontrado")
    await db.services.update_one({"id": service_id, "shop_id": shop_id}, {"$set": data.model_dump()})
    return await db.services.find_one({"id": service_id, "shop_id": shop_id}, {"_id": 0})

@api.get("/admin/products")
async def admin_products(user=Depends(staff_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    return await db.products.find({"shop_id": shop_id}, {"_id": 0}).sort("name", 1).to_list(100)

@api.post("/admin/products")
async def add_product(data: ProductInput, user=Depends(admin_only)):
    item = {"id": str(uuid.uuid4()), "shop_id": user.get("shop_id") or await default_shop_id(), **data.model_dump()}
    await db.products.insert_one(item)
    item.pop("_id", None)
    return item

@api.patch("/admin/products/{product_id}")
async def update_product(product_id: str, data: ProductInput, user=Depends(admin_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    if not await db.products.find_one({"id": product_id, "shop_id": shop_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Produto não encontrado")
    await db.products.update_one({"id": product_id, "shop_id": shop_id}, {"$set": data.model_dump()})
    return await db.products.find_one({"id": product_id, "shop_id": shop_id}, {"_id": 0})

@api.get("/admin/courtesies")
async def admin_courtesies(user=Depends(staff_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    return await db.courtesies.find({"shop_id": shop_id}, {"_id": 0}).sort("name", 1).to_list(100)

@api.post("/admin/courtesies")
async def add_courtesy(data: CourtesyInput, user=Depends(admin_only)):
    item = {"id": str(uuid.uuid4()), "shop_id": user.get("shop_id") or await default_shop_id(), **data.model_dump()}
    await db.courtesies.insert_one(item)
    item.pop("_id", None)
    return item

@api.patch("/admin/courtesies/{courtesy_id}")
async def update_courtesy(courtesy_id: str, data: CourtesyInput, user=Depends(admin_only)):
    shop_id = user.get("shop_id") or await default_shop_id()
    if not await db.courtesies.find_one({"id": courtesy_id, "shop_id": shop_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Cortesia não encontrada")
    await db.courtesies.update_one({"id": courtesy_id, "shop_id": shop_id}, {"$set": data.model_dump()})
    return await db.courtesies.find_one({"id": courtesy_id, "shop_id": shop_id}, {"_id": 0})

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=False, allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown(): mongo.close()