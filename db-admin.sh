#!/usr/bin/env bash
# db-admin.sh — inicia o pgAdmin para administração visual do PostgreSQL.
# O pgAdmin é exposto em http://127.0.0.1:5050 via SSH tunnel (ou acesso local).
#
# Uso: ./db-admin.sh [--stop]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${ROOT_DIR}/backend/docker-compose.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não encontrado no PATH." >&2
  exit 1
fi

if [[ "${1:-}" == "--stop" ]]; then
  echo "Parando pgAdmin..."
  docker compose -f "${COMPOSE_FILE}" --profile db-admin stop pgadmin
  exit 0
fi

echo "Iniciando pgAdmin..."
docker compose -f "${COMPOSE_FILE}" --profile db-admin up -d pgadmin

echo ""
echo "✅ pgAdmin disponível em http://127.0.0.1:5050"
echo ""
echo "Se estiver em um servidor remoto, abra um SSH tunnel antes de acessar:"
echo "  ssh -L 5050:127.0.0.1:5050 usuario@seu-servidor"
echo ""
echo "Credenciais definidas em backend/.env (PGADMIN_EMAIL / PGADMIN_PASSWORD)"
echo ""
echo "Para parar: ./db-admin.sh --stop"
