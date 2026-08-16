# Shared image for all 3 agents — the entrypoint module is selected at
# `docker run`/Cloud Run deploy time via the AGENT_MODULE build arg or the
# CMD override, so one image serves scout, cfo, and host.
FROM python:3.11-slim

WORKDIR /app

COPY agents/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY agents/ ./agents/
COPY integrations/ ./integrations/

ENV PYTHONPATH=/app/agents:/app
ENV PORT=8080

# Default: scout agent. Override CMD per-service in docker-compose.yml / Cloud Run.
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--chdir", "agents", "scout_agent:app"]
