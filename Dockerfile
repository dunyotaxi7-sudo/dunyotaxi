# Backend API (FastAPI).
#
# Python 3.12 — not 3.13/3.14. The pinned deps (asyncpg 0.29, shapely 2.0.4,
# pydantic 2.7) publish cp312 wheels; newer Pythons would force a source build.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Deps first — this layer is cached until requirements.txt changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Driver documents live here; docker-compose mounts a volume so they survive
# redeploys. Never bake uploads into the image.
RUN mkdir -p uploads

# Run as a non-root user.
RUN useradd -m -u 1000 app && chown -R app:app /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status==200 else 1)"

# Single worker on purpose: WebSocket registries and the in-flight dispatch
# loops live in this process's memory. Scaling to multiple workers/replicas
# needs Redis pub/sub first (see DEPLOYMENT.md → Scaling).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
