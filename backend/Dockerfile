FROM node:20-alpine AS builder

WORKDIR /app

# Instalar pacotes necessários para o SQLite3 (node-gyp rebuild)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . .

# Fazemos o build da aplicação TypeScript para a pasta "dist"
RUN npm run build

# ===== ESTÁGIO DE PRODUÇÃO =====
FROM node:20-alpine

WORKDIR /app

# O better-sqlite3 pode exigir compilação ou depender de libs da libc que o node-gyp usou.
# Então podemos também garantir esses pacotes aqui, ou rodar o npm ci puro.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
# Instala open apenas as necessárias, limitando o tamanho do container
RUN npm install --omit=dev

# Copia os arquivos gerados no estágio anterior
COPY --from=builder /app/dist ./dist

# Criar diretório de dados para persistência do SQLite
RUN mkdir -p /app/data

EXPOSE 3001

# Definir volume persistente caso queira usar um banco SQLite3 no servidor físico e não perdê-lo
ENV NODE_ENV=production
ENV PORT=3001

CMD ["npm", "start"]
