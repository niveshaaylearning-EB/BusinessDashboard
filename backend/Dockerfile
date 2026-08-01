# Backend — FastAPI served by uvicorn
# NOTE: no .env is ever copied into this image. Real secrets are injected at
# container start via docker-compose's `env_file`, which points at a local
# backend/.env you create yourself (copy backend/.env.example -> backend/.env
# and paste in real values). That file is gitignored and never enters the
# image or the repo, so nothing secret ships with the build.

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY setup_db.py .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
