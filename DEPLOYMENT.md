# 🚀 Deployment Guide - Fodinha Card Game

## ⚠️ IMPORTANTE: Plataformas Incompatíveis

### ❌ **NÃO DEPLOY NA VERCEL**
Este projeto usa **Socket.io** que requer **WebSocket persistente**. A Vercel usa **serverless functions** que não suportam conexões persistentes.

**Plataformas incompatíveis:**
- ❌ Vercel
- ❌ Netlify Functions
- ❌ AWS Lambda (serverless)
- ❌ Google Cloud Functions

### ✅ **Plataformas Recomendadas**

1. **Railway** (Recomendado)
   - ✅ Suporta WebSockets
   - ✅ Deploy fácil com Docker
   - ✅ SSL automático
   - ✅ Logs em tempo real

2. **Render**
   - ✅ Suporta WebSockets
   - ✅ Free tier disponível
   - ✅ SSL automático

3. **Heroku**
   - ✅ Suporta WebSockets
   - ⚠️ Plano gratuito descontinuado

4. **DigitalOcean App Platform**
   - ✅ Suporta WebSockets
   - ✅ $5/mês

5. **VPS (DigitalOcean, AWS EC2, etc)**
   - ✅ Controle total
   - ✅ Use Docker Compose
   - ⚠️ Requer mais configuração

---

## 📋 Pré-requisitos

- Node.js 20+
- Docker (opcional, mas recomendado)
- Domínio próprio (opcional)

---

## 🐳 Deploy com Docker (Recomendado)

### 1. Configure as variáveis de ambiente

**Backend (`backend/.env`):**
```env
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://seu-frontend.com,https://seu-dominio.com
```

**Frontend (`frontend/.env`):**
```env
NEXT_PUBLIC_BACKEND_URL=https://seu-backend.com
```

### 2. Build e Deploy

```bash
# No diretório backend/
docker-compose up -d
```

O Docker Compose já está configurado com:
- Backend na porta 3001
- Caddy proxy reverso (SSL automático)
- Volume persistente para SQLite

### 3. Painel visual do banco (opcional)

O Compose inclui um serviço `db-admin` com `sqlite-web`, desligado por padrão e preso em `127.0.0.1:8081` para não expor o banco publicamente.

```bash
cd backend
docker compose --profile db-admin up -d db-admin
```

Abra no próprio servidor:

```text
http://127.0.0.1:8081
```

Para acessar remotamente sem publicar a porta na internet, faça um túnel SSH:

```bash
ssh -L 8081:127.0.0.1:8081 usuario@seu-servidor
```

Depois abra `http://127.0.0.1:8081` no navegador local.

Para desligar o painel:

```bash
cd backend
docker compose --profile db-admin stop db-admin
```

---

## 🖥️ Deploy Manual (VPS)

### Backend

```bash
cd backend

# Instalar dependências
npm install --production

# Build
npm run build

# Configurar variáveis de ambiente
cp .env.example .env
nano .env  # Edite com suas configurações

# Iniciar com PM2 (recomendado)
npm install -g pm2
pm2 start dist/index.js --name fodinha-backend
pm2 save
pm2 startup
```

### Frontend

```bash
cd frontend

# Instalar dependências
npm install

# Configurar variável de ambiente
cp .env.example .env
nano .env  # Coloque a URL do backend

# Build
npm run build

# Iniciar
npm start
```

### Nginx Reverse Proxy (Opcional)

```nginx
# Backend (WebSocket)
server {
    listen 80;
    server_name api.seudominio.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name seudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

---

## 🔒 Checklist de Segurança

Antes de colocar em produção:

- [ ] Configurar `CORS_ORIGIN` com URLs específicas (remover `*`)
- [ ] Configurar SSL/HTTPS
- [ ] Configurar backup automático do banco SQLite
- [ ] Configurar monitoramento (ex: PM2, Docker logs)
- [ ] Configurar rate limiting no nginx/caddy
- [ ] Revisar logs de erro periodicamente
- [ ] Configurar alertas para downtime

---

## 💾 Backup do Banco de Dados

O banco SQLite fica em `backend/data/fodinha.db`

### Backup manual:
```bash
cp backend/data/fodinha.db backend/data/fodinha.db.backup
```

### Backup automático (cron):
```bash
# Adicione ao crontab (crontab -e)
0 2 * * * cp /caminho/para/backend/data/fodinha.db /caminho/para/backups/fodinha-$(date +\%Y\%m\%d).db
```

---

## 📊 Monitoramento

### Logs do Backend
```bash
# Com PM2
pm2 logs fodinha-backend

# Com Docker
docker logs -f fodinha-backend
```

### Métricas importantes:
- Número de salas ativas
- Número de jogadores conectados
- Taxa de erro de WebSocket
- Uso de CPU e memória

---

## 🐛 Troubleshooting

### WebSocket não conecta
- ✅ Verifique CORS_ORIGIN
- ✅ Verifique se o proxy permite Upgrade header
- ✅ Verifique firewall (porta 3001)

### Banco de dados corrompido
```bash
# Verificar integridade
sqlite3 backend/data/fodinha.db "PRAGMA integrity_check;"

# Restaurar backup
cp backend/data/fodinha.db.backup backend/data/fodinha.db
```

### Performance ruim
- ✅ Aumente RAM do servidor
- ✅ Use SSD para SQLite
- ✅ Configure WAL mode (já está configurado)

---

## 📈 Escalabilidade

Este projeto usa SQLite e não é horizontalmente escalável (múltiplos servidores).

Para escalar:
1. Migre para PostgreSQL/MySQL
2. Use Redis para sessions
3. Configure sticky sessions no load balancer
4. Considere usar Socket.io com Redis adapter

---

## 📞 Suporte

Para problemas específicos do deployment, verifique:
- Logs do servidor
- Documentação da plataforma escolhida
- GitHub Issues do projeto
