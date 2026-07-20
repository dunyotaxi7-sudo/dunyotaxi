# Deploying Bukhara Taxi

Production runs as **one VPS** (backend + Postgres/PostGIS + Redis + Nginx via
Docker), plus **Vercel** for the admin panel and **EAS** for the mobile apps.

| Piece | Where | Why |
|---|---|---|
| API + DB + Redis + Nginx | 1 VPS, Docker Compose | co-located = low latency; DB stays in-country |
| Admin panel (Next.js) | Vercel | free, HTTPS, deploys from GitHub |
| Mobile (passenger+driver) | EAS Build → Play/App Store | one app, both roles |

> **⚠️ Uzbekistan data localization.** Personal data of Uzbek citizens (names,
> phones, **passport photos**, locations) must be stored on servers **in
> Uzbekistan**. You store all of that. A German/Dutch VPS (Hetzner, Contabo) is
> cheaper and fine for a *pilot*, but for public launch host in UZ. Confirm with
> someone who knows the regulation.

**Sizing:** 4 GB RAM / 2 vCPU / 40 GB is the sane minimum (Postgres+PostGIS
~400 MB, API ~400 MB, Redis ~100 MB, OS ~300 MB, plus headroom). **1 GB will
OOM-kill.** Hetzner **CX33** (4 vCPU/8 GB, €8.99) is comfortable.

---

## 1. Server prep

```bash
ssh root@YOUR_SERVER
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh          # Docker + compose plugin

# Firewall: only SSH + HTTP(S). Postgres/Redis are never exposed.
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

Point DNS at the server **before** requesting certificates:

| Record | Name | Value |
|---|---|---|
| A | `api.yourdomain.uz` | your server IP |

## 2. Get the code + config

```bash
git clone https://github.com/dunyotaxi7-sudo/dunyotaxi.git /opt/taxi
cd /opt/taxi
cp .env.production.example .env.production
```

Fill in `.env.production`. Generate real secrets — **never reuse the dev ones**:

```bash
openssl rand -hex 32      # -> JWT_SECRET
openssl rand -base64 32   # -> POSTGRES_PASSWORD
```

Must-set values:

| Key | Value |
|---|---|
| `DOMAIN` | `api.yourdomain.uz` |
| `JWT_SECRET` | the generated hex (dev default is `change-me`) |
| `POSTGRES_PASSWORD` | the generated string |
| `CORS_ORIGINS` | `https://admin.yourdomain.uz` — **not** `*` |
| `DEBUG` | `false` |
| `SMS_PROVIDER` | `eskiz` |
| `ESKIZ_EMAIL` / `ESKIZ_PASSWORD` | your Eskiz login (the app renews its own token) |
| `OTP_MESSAGE_TEMPLATE` | wording **approved** in your Eskiz account |

## 3. Certificates (first boot)

Nginx won't start without certs, and Certbot needs port 80 — so issue them first:

```bash
docker compose up -d db redis api          # nginx NOT yet
source .env.production

docker run --rm -p 80:80 \
  -v taxi_certbot_conf:/etc/letsencrypt \
  -v taxi_certbot_www:/var/www/certbot \
  certbot/certbot certonly --standalone \
  -d "$DOMAIN" --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email

docker compose up -d                       # now nginx + certbot renewal
```

> Volume names are prefixed with the project dir (`/opt/taxi` → `taxi_`). Check
> with `docker volume ls` if the names differ.

Renewal is automatic (the `certbot` service retries every 12h). Reload nginx
monthly so it picks up renewed certs: `docker compose exec nginx nginx -s reload`.

## 4. Migrations + seed

```bash
docker compose exec api alembic upgrade head          # schema
docker compose exec api python scripts/load_service_area.py   # Bukhara polygon
docker compose exec api python scripts/create_admin.py        # your admin user
```

The service-area polygon is **required** — without it the geofence fails open
and rides outside Bukhara would be accepted.

## 5. Verify

```bash
curl https://api.yourdomain.uz/health        # {"status":"ok","redis":true}
docker compose ps                            # all healthy
docker compose logs -f api
```

Check the WebSocket too (the live board and driver GPS depend on it):

```bash
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
     https://api.yourdomain.uz/ws/admin        # expect 101/403, NOT 502
```

## 6. Admin panel → Vercel

1. Import the GitHub repo on Vercel.
2. **Root Directory: `admin`** ← easy to miss; the build fails without it.
3. Environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://api.yourdomain.uz`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` = your key
   - `NEXT_PUBLIC_MAPS_LANGUAGE` = `uz`
4. Deploy, then set `CORS_ORIGINS` on the server to the Vercel domain and
   `docker compose up -d api`.
5. **Restrict the Maps key** (Google Cloud → Credentials) to your admin domain,
   or it gets scraped and billed to you.

## 7. Mobile → EAS

Identity is already set (`app.json`): **Dunyo Taxi**, bundle **`uz.dunyotaxi.app`**.
⚠️ The bundle id can never change once published.

```bash
cd mobile
npm install
npx expo install expo-dev-client
npx eas login
npx eas init            # creates the EAS project + writes extra.eas.projectId
```

`eas init` is what makes **push notifications work** — `registerForPush()` returns
null without a `projectId`, and drivers would get no ride offers while
backgrounded.

The Google Maps key is a real credential, so it lives in EAS secrets rather than
the committed `eas.json` (`app.config.js` injects it into the native manifest at
build time):

```bash
eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value "AIza..."
```

Edit the API URL in `eas.json` (`preview` + `production`) to your real domain,
then:

```bash
eas build -p android --profile production
eas submit -p android
```

### Store review needs a way in
Reviewers **cannot receive an Uzbek SMS**, so they can't pass OTP. Give them a
test number via the allowlist on the server:

```
OTP_TEST_PHONES=+998900000000:123456
```

Put that number + code in the Play Console / App Store "demo account" notes.
Rotate the code after review passes.

> Your local dev build was `com.anonymous.mobile` with scheme `mobile`. The new
> id/scheme make it a *different app* — run `npx expo prebuild -p android --clean`
> and `npx expo run:android` once to reinstall locally.

---

## Updating

```bash
cd /opt/taxi && git pull
docker compose build api && docker compose up -d api
docker compose exec api alembic upgrade head    # if migrations changed
```

## Backups (do this before launch)

```bash
# Database
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup-$(date +%F).sql.gz
# Driver documents
docker run --rm -v taxi_uploads:/data -v $(pwd):/out alpine \
  tar czf /out/uploads-$(date +%F).tar.gz -C /data .
```
Put both in a nightly cron and copy them **off the box**. A VPS dying with no
backup means losing every ride, wallet balance, and uploaded passport.

## Scaling — read before adding replicas

The API runs **one instance on purpose**. WebSocket connections and in-flight
ride-dispatch loops live in that process's memory (`app/websockets/manager.py`).
A second replica would silently break dispatch: a driver connected to replica A
would never receive an offer created on replica B.

One box handles Bukhara comfortably (≈100 req/s at 500 online drivers). To go
wider, first move the WS registries + offer broker to **Redis pub/sub**, then
scale.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `502` from nginx | API container down/unhealthy → `docker compose logs api` |
| WebSockets fail, HTTP fine | `Upgrade`/`Connection` headers missing from the nginx proxy block |
| Everyone gets `429` on login | per-IP OTP limit seeing nginx's IP — `X-Real-IP` must reach the API |
| Document upload → `413` | `client_max_body_size` too low (needs ≥ 12m) |
| `alembic` fails: no driver | `psycopg[binary]` missing from requirements.txt |
| Admin panel: CORS error | `CORS_ORIGINS` doesn't match the Vercel domain exactly (scheme included) |
| Cert renewal fails | port 80 blocked, or `/.well-known/acme-challenge` not reachable |
