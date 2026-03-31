# 🔒 Security Best Practices

## Configuração de Produção

### 1. Variáveis de Ambiente

**NUNCA commite arquivos `.env` no Git!**

#### Backend `.env`:
```env
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://seudominio.com
```

#### Frontend `.env`:
```env
NEXT_PUBLIC_BACKEND_URL=https://api.seudominio.com
```

### 2. CORS

Por padrão, CORS está configurado para aceitar qualquer origem em desenvolvimento.

**Em produção**, defina `CORS_ORIGIN` com URLs específicas:
```env
CORS_ORIGIN=https://seudominio.com,https://www.seudominio.com
```

### 3. Rate Limiting

O sistema possui rate limiting para:
- ✅ Mensagens de chat: 10 mensagens por minuto
- ⚠️ Outras ações: Sem limite (adicionar se necessário)

### 4. Validação de Inputs

Todas as entradas do usuário são validadas:
- ✅ Nomes de jogadores (máx 16 caracteres)
- ✅ Mensagens de chat (máx 200 caracteres)
- ✅ Códigos de sala (5 caracteres alfanuméricos)
- ✅ Sanitização de HTML (prevenção XSS)
- ✅ Filtro de palavrões básico

### 5. SQLite Security

- ✅ WAL mode habilitado (melhor concorrência)
- ✅ Foreign keys habilitadas
- ⚠️ Sem criptografia nativa (dados não sensíveis)

**Recomendação:** Faça backup regular do arquivo `data/fodinha.db`

### 6. WebSocket Security

- ⚠️ Sem autenticação (jogo casual)
- ✅ Validação de sessão via UUID
- ✅ Proteção contra flood de mensagens
- ⚠️ Considere adicionar auth para salas privadas

### 7. DDoS Protection

**Camadas de proteção recomendadas:**
- Cloudflare (proxy reverso)
- Rate limiting no nginx/caddy
- Firewall no servidor

### 8. SSL/HTTPS

**OBRIGATÓRIO em produção!**

Use Caddy (SSL automático) ou Certbot (Let's Encrypt)

---

## Vulnerabilidades Conhecidas

### 1. Sem Autenticação de Usuário
- **Risco:** Baixo (jogo casual)
- **Impacto:** Usuários podem usar qualquer nome
- **Mitigação:** Filtro de palavrões, rate limiting

### 2. SQLite em Produção
- **Risco:** Médio (não escalável)
- **Impacto:** Limite de ~1000 usuários simultâneos
- **Mitigação:** Backup regular, migrar para PostgreSQL se necessário

### 3. Sem Criptografia de Dados
- **Risco:** Baixo (dados não sensíveis)
- **Impacto:** Nenhum dado pessoal armazenado
- **Mitigação:** Não armazenar dados sensíveis

### 4. CORS Aberto (Desenvolvimento)
- **Risco:** Alto (apenas em dev)
- **Impacto:** Qualquer site pode usar seu backend
- **Mitigação:** Configurar `CORS_ORIGIN` em produção

---

## Checklist de Segurança

Antes de deploy em produção:

- [ ] Configurar `CORS_ORIGIN` específico
- [ ] Habilitar HTTPS/SSL
- [ ] Configurar backup automático do SQLite
- [ ] Adicionar Cloudflare ou outro DDoS protection
- [ ] Configurar monitoramento de logs
- [ ] Testar rate limiting
- [ ] Revisar e atualizar filtro de palavrões
- [ ] Configurar firewall no servidor
- [ ] Limitar portas expostas (apenas 80/443)
- [ ] Desabilitar logs de debug em produção

---

## Relatório de Vulnerabilidades

Se encontrar uma vulnerabilidade de segurança, por favor:

1. **NÃO** abra uma issue pública
2. Entre em contato diretamente com o maintainer
3. Aguarde resposta antes de divulgar

---

## Atualizações de Segurança

### Dependências

Execute regularmente:
```bash
npm audit
npm audit fix
```

### Logs de Segurança

Monitore:
- Tentativas de SQL injection (logs do backend)
- Flood de requisições (logs do nginx/caddy)
- Erros de validação (logs da aplicação)

---

## Conformidade

### LGPD/GDPR

Este jogo **NÃO coleta dados pessoais**:
- ✅ Nenhum email
- ✅ Nenhum telefone
- ✅ Nenhum IP armazenado
- ✅ Apenas apelidos temporários

**Cookies:** Não usa cookies (apenas localStorage para reconexão)

---

## Contato de Segurança

Para reportar vulnerabilidades:
- Email: [seu-email@dominio.com]
- GitHub: [abrir issue privada]
