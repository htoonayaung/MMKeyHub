# MMKeyHub — Automated Digital Keys, Accounts & VPN Commerce Platform

**MMKeyHub** is a production-ready, bilingual (**English / မြန်မာ**) digital commerce monorepo built for selling software license keys, premium accounts, and VPN configurations with **KPay / WavePay** local payments, **24/7 automated receipt + bank SMS verification**, a **Telegram Bot & Mini App**, and an **isolated Admin Operations Portal**.

---

## Key Features

### Storefront & Customer Experience
- **Bilingual Storefront (EN / မြန်မာ)** with Light / Dark theme switching and custom brand logo support.
- **Hero Banner Slider & Flash Sale Countdown** with strikethrough original prices and automatic discount percentage badges.
- **Multi-Item Shopping Cart** with promo codes (`PERCENTAGE` / `FIXED_MMK`), sticky mobile bottom navigation, and quick buy flows.
- **KPay & WavePay Checkout** with copyable receiving numbers, QR display, receipt screenshot upload, and guest/Telegram order tracking.
- **Instant Credential Vault Delivery**: AES-256-GCM encrypted stock keys automatically unlock in the web order tracker, downloadable `.txt` receipt, optional SMTP email, and Telegram DM upon verification.

### Isolated Admin Portal
- **Completely Hidden from Public Users**: Zero admin links or tabs appear on the public storefront.
- **Standalone Dark Console**: Renders independently without storefront navigation, cart drawers, or customer widgets, protected by `ADMIN_API_KEY`, `robots.txt` disallow, and `X-Robots-Tag: noindex, nofollow`.
- **Flexible Production Separation**:
  - **Secret URL Path** (`ADMIN_PORTAL_PATH` + `NEXT_PUBLIC_ADMIN_PORTAL_PATH`, e.g. `/ops-portal-9x7k`): returns `404 Not Found` on `/admin`.
  - **Dedicated Admin Subdomain** (`ADMIN_ALLOWED_HOST`, e.g. `admin.yourdomain.com`): returns `404 Not Found` when accessed from the public shop domain.
- **Product Management with Direct Cover Image Upload**: Upload JPG/PNG/WEBP product covers directly in Add/Edit Product forms (automatically validated, metadata-stripped, and converted to WebP via `sharp`).
- **Bulk Encrypted Stock Upload**, **Order Search & CSV Export**, **Incoming SMS Ledger with 1-Click Linking**, **Promo Code Manager**, **Telegram Broadcasts**, **Daily Summary Reports**, **Shop Online/Night Mode Toggle**, and **Read-Only Security Audit Logs**.

### Security Hardening
- **Receipt & Product Image Sanitization (`sharp`)**: Verifies true binary image headers, strips all EXIF/GPS/XMP/polyglot payloads, and re-encodes to clean WebP.
- **Anti-Fraud Duplicate & Perceptual Hash Detection**: Rejects exact duplicate receipt SHA-256 hashes (`409`) and flags `⚠️ SIMILAR SLIP DETECTED` using 64-bit dHash (Hamming distance `<= 5`) in Admin Group alerts.
- **AI Vision Prompt-Injection Guardrails**: Treats all receipt OCR text as strictly untrusted data with post-OCR numeric, transaction ID, and confidence threshold checks (`>= 0.85`).
- **SMS Webhook Anti-Replay & Spoofing Protection**: Supports HMAC-SHA256 (`x-webhook-signature`) + 3-minute freshness (`x-webhook-timestamp`), with backward-compatible `x-webhook-secret` support.
- **Immutable Audit Trail & Critical Canary Alerts**: Logs sensitive actions to PostgreSQL (`AuditLog`) and sends immediate `🚨 CRITICAL SECURITY ALERT` messages to the Telegram Admin Group whenever merchant KPay/WavePay receiving phone numbers or account names are modified.
- **Container & Network Hardening**: Non-root `USER node` Docker images, internal-only PostgreSQL (`mmkeyhub_net`), and hardened Nginx CSP / security headers.

---

## Monorepo Structure

```text
.
├── apps/
│   ├── api/                 # Express REST API, grammY Telegram Bot, Prisma services, Sharp image pipeline
│   └── web/                 # Next.js 15 App Router storefront, Telegram Mini App & isolated Admin Portal
├── packages/
│   └── shared/              # Shared TypeScript types and helpers
├── prisma/                  # PostgreSQL Prisma schema & seed script
├── docker/
│   └── nginx/               # HTTP (`nginx.conf`) & Let's Encrypt HTTPS (`nginx.ssl.conf.template`) configs
├── .github/workflows/       # GitHub Actions CI verification & SSH auto-deploy workflow (`deploy.yml`)
├── docker-compose.yml       # Full stack: PostgreSQL 16 + API + Next.js Web + Nginx + Certbot
└── .env.example             # Environment configuration template
```

---

## Linux VM Local Testing Manual (Ubuntu / Debian)

ကိုယ်ပိုင် Linux VM ပေါ်တွင် GitHub မှ Clone ဆွဲ၍ စမ်းသပ်ရန် အဆင့်ဆင့် လမ်းညွှန် —

### 1. Install Git & Docker on the Linux VM

```bash
sudo apt update && sudo apt install -y git curl openssl ca-certificates

# Install Docker Engine & Docker Compose plugin
curl -fsSL https://get.docker.com | sudo sh

# Allow current user to run docker without sudo
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### 2. Clone the Repository

```bash
git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git mmkeyhub
cd mmkeyhub
```

### 3. Find Your VM IP Address

*(Ensure VM networking is set to **Bridged Adapter** or Port Forwarding `80 -> 80` so your host browser can reach it.)*

```bash
hostname -I
```
Example output: `192.168.1.50`

### 4. Generate Secrets & Configure `.env`

```bash
cp .env.example .env

# Generate strong random keys
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "ORDER_TOKEN_SECRET=$(openssl rand -hex 32)"
echo "ADMIN_API_KEY=mmkeyhub_$(openssl rand -hex 12)"
echo "PAYMENT_WEBHOOK_SECRET=$(openssl rand -hex 16)"
```

Edit `.env` (`nano .env`) and update these core fields (replace `192.168.1.50` with your VM IP):

```env
NODE_ENV="production"
APP_DOMAIN="192.168.1.50"
APP_URL="http://192.168.1.50"

# Seed sample categories, products, payment methods, and demo stock on first boot
RUN_SEED_ON_BOOT="true"

# PostgreSQL (keep password identical in both POSTGRES_PASSWORD and DATABASE_URL)
POSTGRES_USER="mmkeyhub"
POSTGRES_PASSWORD="StrongVmPassword123!"
POSTGRES_DB="mmkeyhub_db"
DATABASE_URL="postgresql://mmkeyhub:StrongVmPassword123!@postgres:5432/mmkeyhub_db?schema=public"

# Security Keys (ENCRYPTION_KEY & ENCRYPTION_MASTER_KEY must match, 64 hex chars)
ENCRYPTION_KEY="<64-hex-chars>"
ENCRYPTION_MASTER_KEY="<same-64-hex-chars>"
ADMIN_API_KEY="mmkeyhub_my_strong_admin_key_2025"   # minimum 16 characters
ORDER_TOKEN_SECRET="<64-hex-chars>"

# Allow host browser & localhost origins
CORS_ORIGIN="http://localhost,http://127.0.0.1,http://192.168.1.50"

# Isolated Admin Portal (default /admin; or change to a private path like /ops-portal-9x7k)
ADMIN_PORTAL_PATH="/admin"
NEXT_PUBLIC_ADMIN_PORTAL_PATH="/admin"
ADMIN_ALLOWED_HOST=""

# Optional Telegram Bot (leave TELEGRAM_WEBHOOK_URL empty for Long Polling mode on local VM)
TELEGRAM_BOT_TOKEN=""
TELEGRAM_BOT_USERNAME="MMKeyHubBot"
TELEGRAM_ADMIN_GROUP_ID=""
TELEGRAM_WEBHOOK_URL=""

# Optional AI Receipt Verification & SMS Webhook
GEMINI_API_KEY=""
PAYMENT_WEBHOOK_SECRET="<your-webhook-secret>"
```

### 5. Build & Start the Stack

```bash
docker compose up -d --build
```

Check container health and API startup logs:

```bash
docker compose ps
docker compose logs -f api
```

Wait until you see `[MMKeyHub API] Listening on port 4000`, then press `Ctrl + C`.

If UFW firewall is enabled on the VM, allow port 80:

```bash
sudo ufw allow 80/tcp
```

### 6. Access & Test from Your Browser

Replace `192.168.1.50` with your VM IP:

- **Public Storefront**: `http://192.168.1.50/`
- **Isolated Admin Portal**: `http://192.168.1.50/admin` *(sign in using `ADMIN_API_KEY` from `.env`)*
- **API Healthcheck**: `http://192.168.1.50/api/health` → `{"status":"ok","database":"connected"}`

After the initial seed completes, set `RUN_SEED_ON_BOOT="false"` in `.env` and restart the API:

```bash
docker compose restart api
```

> **Note on Telegram Bot on a Local VM**: Setting `TELEGRAM_BOT_TOKEN` with an empty `TELEGRAM_WEBHOOK_URL` runs the bot in **Long Polling** mode, so customer commands (`/start`) and Admin Group approval alerts work immediately without a domain or SSL. Only the Telegram **Mini App WebView button** requires an HTTPS domain (available once deployed on a VPS with Let's Encrypt or via Cloudflare Tunnel).

---

## Isolating the Admin Portal in Production

### Option A — Custom Secret URL Path
Set both variables in `.env` to a private path:
```env
ADMIN_PORTAL_PATH="/ops-portal-9x7k"
NEXT_PUBLIC_ADMIN_PORTAL_PATH="/ops-portal-9x7k"
```
Then rebuild the web container so the client bundle picks up `NEXT_PUBLIC_ADMIN_PORTAL_PATH`:
```bash
docker compose up -d --build web
```
Direct visits to `/admin` will return `404 Not Found`.

### Option B — Dedicated Admin Subdomain
1. Point an `A` DNS record for `admin.yourdomain.com` to your VPS IP and issue a Let's Encrypt certificate.
2. Set `ADMIN_ALLOWED_HOST="admin.yourdomain.com"` in `.env`.
3. Uncomment the dedicated `admin.YOUR_DOMAIN.COM` server block in `docker/nginx/nginx.ssl.conf.template` (optionally restricting by static IP).
4. Requests to the Admin Portal on the public shop domain will return `404 Not Found`.

---

## Production VPS, HTTPS (SSL) & GitHub Actions Auto-Deploy

### Enabling Let's Encrypt HTTPS
```bash
# 1. Start the stack on HTTP first so Certbot can complete the ACME webroot challenge
docker compose up -d --build

# 2. Issue TLS certificate for your domain
docker compose --profile ssl run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d yourdomain.com \
  --email you@yourdomain.com --agree-tos --no-eff-email

# 3. Prepare production HTTPS Nginx config
cp docker/nginx/nginx.ssl.conf.template docker/nginx/nginx.conf
sed -i 's/YOUR_DOMAIN.COM/yourdomain.com/g' docker/nginx/nginx.conf

# 4. Reload Nginx & start automatic certificate renewal container
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
docker compose --profile ssl up -d certbot
```

### GitHub Actions Auto-Deploy
Pushing to `main` automatically runs TypeScript/build checks and deploys over SSH when the following **GitHub Repository Secrets** are configured (`Settings → Secrets and variables → Actions`):

| Secret | Description |
| --- | --- |
| `VPS_HOST` | Public IP or hostname of your VPS |
| `VPS_USER` | SSH username (e.g. `ubuntu` or `deploy`) |
| `VPS_SSH_KEY` | Private SSH key authorized on the VPS |
| `VPS_PORT` | *(Optional)* SSH port (defaults to `22`) |
| `VPS_APP_DIR` | *(Optional)* Project directory on the VPS (defaults to `~/mmkeyhub`) |

---

## Useful Operations Commands

```bash
# Pull latest code from GitHub and rebuild containers
git pull && docker compose up -d --build

# Follow live logs per service
docker compose logs -f api
docker compose logs -f web
docker compose logs -f nginx

# Stop containers (preserves PostgreSQL data & uploaded files)
docker compose down

# Full reset: stop containers AND wipe database + uploaded images/receipts
docker compose down -v
```
