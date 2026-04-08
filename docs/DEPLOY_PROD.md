# Deploy em Produção — Fodinha

Tutorial completo para subir o jogo em um servidor VPS com Docker, Caddy (SSL automático) e PostgreSQL.

---

## Pré-requisitos

| Requisito | Versão mínima |
|-----------|---------------|
| VPS Linux (Ubuntu 22.04 recomendado) | — |
| Docker Engine | 24+ |
| Docker Compose plugin | 2.20+ |
| Domínio apontando para o IP do servidor | — |
| Portas abertas no firewall | 80, 443 |

Instalar Docker + Compose (Ubuntu):
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Relogar para o grupo ter efeito
```

---

## 1. Clonar o repositório

```bash
git clone https://github.com/seu-usuario/fodinha.git
cd fodinha/backend
```

---

## 2. Configurar variáveis de ambiente

Copie o exemplo e edite com seus valores:

```bash
cp .env.example .env
nano .env
```

Variáveis obrigatórias:

```dotenv
# Banco de dados PostgreSQL
POSTGRES_USER=fodinha
POSTGRES_PASSWORD=uma_senha_forte_aqui
POSTGRES_DB=fodinha
DATABASE_URL=postgresql://fodinha:uma_senha_forte_aqui@postgres:5432/fodinha

# Domínio público (sem https://)
DOMAIN=jogo.seudominio.com

# CORS — mesmo valor que o domínio, com https://
CORS_ORIGIN=https://jogo.seudominio.com

# pgAdmin (opcional, só necessário se usar --profile db-admin)
PGADMIN_EMAIL=admin@seudominio.com
PGADMIN_PASSWORD=outra_senha_forte
```

> **Segurança:** nunca commite o arquivo `.env`. Ele já está no `.gitignore`.

---

## 3. Subir os serviços

```bash
# A partir de backend/
docker compose up -d
```

O Caddy vai obter o certificado SSL via Let's Encrypt automaticamente. Aguarde ~30 segundos na primeira vez.

Verificar se todos os serviços subiram:

```bash
docker compose ps
```

Saída esperada:
```
NAME        STATUS          PORTS
postgres    Up (healthy)    5432/tcp
backend     Up              3001/tcp
caddy       Up              0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

---

## 4. Verificar logs

```bash
# Todos os serviços
docker compose logs -f

# Apenas o backend
docker compose logs -f backend

# Apenas o Caddy (SSL, proxy)
docker compose logs -f caddy
```

---

## 5. Atualizar para nova versão

```bash
git pull
docker compose build backend
docker compose up -d --no-deps backend
```

O PostgreSQL e Caddy não precisam ser reiniciados em atualizações de código.

---

## 6. Backup do banco de dados

Os dados ficam no volume Docker `postgres_data`. Para fazer backup:

```bash
# Dump completo (SQL)
docker compose exec postgres \
  pg_dump -U fodinha fodinha > backup_$(date +%Y%m%d_%H%M%S).sql

# Restaurar de um backup
docker compose exec -T postgres \
  psql -U fodinha fodinha < backup_20250101_120000.sql
```

Automatizar backups diários com cron:

```bash
crontab -e
# Adicionar:
0 3 * * * cd /caminho/fodinha/backend && docker compose exec -T postgres pg_dump -U fodinha fodinha > /backups/fodinha_$(date +\%Y\%m\%d).sql
```

---

## 7. Administração visual do banco (pgAdmin)

O pgAdmin não fica exposto publicamente — acesse via SSH tunnel:

**No servidor:**
```bash
# A partir da raiz do projeto
./db-admin.sh
```

**No seu computador local:**
```bash
ssh -L 5050:127.0.0.1:5050 usuario@jogo.seudominio.com
```

Depois abra http://localhost:5050 no navegador.

- **Email:** valor de `PGADMIN_EMAIL` no `.env`
- **Senha:** valor de `PGADMIN_PASSWORD` no `.env`

Para conectar ao banco no pgAdmin:
- Host: `postgres`
- Port: `5432`
- Database: `fodinha` (valor de `POSTGRES_DB`)
- Username: `fodinha` (valor de `POSTGRES_USER`)
- Password: valor de `POSTGRES_PASSWORD`

Para parar o pgAdmin quando não precisar mais:
```bash
./db-admin.sh --stop
```

---

## 8. Rollback para versão anterior

```bash
# Ver versões disponíveis
git log --oneline -10

# Voltar para um commit específico
git checkout <hash-do-commit>
docker compose build backend
docker compose up -d --no-deps backend
```

Para rollback com migração de banco (se houver breaking changes):
```bash
# Restaurar backup antes do deploy problemático
docker compose exec -T postgres psql -U fodinha fodinha < backup_antes_do_deploy.sql
git checkout <hash-estavel>
docker compose build backend && docker compose up -d --no-deps backend
```

---

## 9. Monitoramento básico

```bash
# Uso de recursos dos containers
docker stats

# Espaço dos volumes
docker system df -v

# Health check do PostgreSQL
docker compose exec postgres pg_isready -U fodinha
```

---

## 10. Firewall (ufw)

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP (Caddy redireciona para HTTPS)
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

As portas 5432 (PostgreSQL) e 5050 (pgAdmin) **não devem** ser abertas no firewall público. O PostgreSQL é acessível apenas internamente via Docker network. O pgAdmin é acessado via SSH tunnel.

---

## Estrutura dos volumes

| Volume | Conteúdo |
|--------|----------|
| `postgres_data` | Dados do banco PostgreSQL |
| `caddy_data` | Certificados SSL do Let's Encrypt |
| `caddy_config` | Configuração em runtime do Caddy |
| `pgadmin_data` | Configurações do pgAdmin |

> Os volumes sobrevivem a `docker compose down`. Use `docker compose down -v` **apenas** se quiser apagar tudo (destruição irreversível dos dados).
