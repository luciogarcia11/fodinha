#!/usr/bin/env bash
# Inicia backend e frontend em paralelo. Ctrl+C encerra ambos.
trap 'echo ""; echo "Encerrando..."; kill $(jobs -p) 2>/dev/null; wait' EXIT INT TERM

echo "🃏 Fodinha — ambiente de desenvolvimento"
echo "  Backend : http://localhost:4000"
echo "  Frontend: http://localhost:3000"
echo ""

(cd backend && PORT=4000 npm run dev) &
(cd frontend && npm run dev -- -p 3000) &

wait
