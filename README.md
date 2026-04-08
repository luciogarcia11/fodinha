# Fodinha — Jogo de Cartas Multiplayer

Implementação multiplayer em tempo real do clássico jogo de cartas brasileiro **Fodinha** (variante de *Oh Hell!*). Backend em TypeScript/Node.js com Express + Socket.IO e frontend em Next.js 14 (App Router) com React + Tailwind CSS.

---

## Arquitetura

```
fodinha/
├── backend/          # Node.js + TypeScript + Socket.IO + SQLite
│   └── src/
│       ├── index.ts           # Servidor principal, handlers de eventos Socket.IO
│       ├── types.ts           # Tipos globais (GameState, Player, RoomConfig…)
│       ├── game/
│       │   ├── logic.ts       # Regras do jogo (apostas, vazas, FDP, manilhas)
│       │   ├── deck.ts        # Geração e ordenação do baralho
│       │   └── roomManager.ts # Gerenciamento de salas em memória + DB
│       ├── db/
│       │   ├── schema.ts      # Criação de tabelas SQLite
│       │   └── rooms.ts       # Persistência de salas
│       └── middleware/
│           └── validation.ts  # Validação de entrada em eventos Socket.IO
└── frontend/         # Next.js 14 App Router + React + Tailwind
    ├── app/
    │   ├── page.tsx           # Tela inicial (criar/entrar em sala)
    │   ├── lobby/page.tsx     # Sala de espera
    │   ├── rooms/page.tsx     # Hub de salas públicas + partidas em andamento
    │   └── game/page.tsx      # Tela principal do jogo
    ├── components/
    │   ├── Chat.tsx           # Chat em tempo real
    │   └── game/              # CardComponent, FanCards
    ├── hooks/useGame.ts       # Hook central com toda lógica de socket
    └── lib/
        ├── types.ts           # Tipos do frontend
        ├── gameContext.tsx    # Context React expondo useGame
        ├── cardUtils.ts       # Utilitários de cartas
        └── socket.ts          # Instância singleton do Socket.IO
```

---

## Como Rodar Localmente

### Pré-requisitos
- Node.js ≥ 18 ou [Bun](https://bun.sh/)

### Início rápido (recomendado)

```bash
# Na raiz do projeto
chmod +x dev.sh
./dev.sh
```

O script `dev.sh` inicia o backend e o frontend em paralelo e encerra ambos com Ctrl+C.

### Manual

```bash
# Terminal 1 — backend (padrão: porta 4000)
cd backend
npm install
npm run dev

# Terminal 2 — frontend (padrão: porta 3000)
cd frontend
npm install
npm run dev
```

> **Variáveis de ambiente:** em produção defina `NEXT_PUBLIC_BACKEND_URL` no frontend apontando para o backend. Em desenvolvimento o cliente usa `http://localhost:4000` por padrão.

### Painel visual do banco (opcional)

Para abrir o SQLite local salvo em `backend/data/fodinha.db` com interface web:

```bash
bash ./db-admin.sh
```

O painel sobe em `http://127.0.0.1:8081` e permite navegar, editar registros e executar SQL.

Se o backend estiver rodando via Docker Compose com o volume nomeado de produção, use o perfil opcional em `backend/docker-compose.yml`:

```bash
cd backend
docker compose --profile db-admin up -d db-admin
```

---

## Funcionalidades

### Jogo
- Rodadas com número de cartas crescente e ciclos completos do baralho
- Apostas por turno, cálculo de vazas, pontuação e eliminação por vidas
- **Regra FDP:** amarração — jogadores com vaza igual à aposta se eliminam mutuamente; em baralho duplo manilhas iguais também se anulam
- **Manilha:** carta virada define a manilha da rodada; naipes desempatam quando `suitTiebreakerRule` está ativo
- **Carta na testa:** `cardOnForeheadRule` — você vê as cartas dos outros, mas não a sua
- Baralho duplo: 2 cópias de cada carta embaralhadas juntas
- Destaque visual da carta vencedora de cada vaza

### Sessões e Reconexão
- Cada jogador recebe um `sessionId` salvo em `localStorage` (`fodinha_session`)
- Janela de 30s para reconectar após queda; durante esse tempo o estado do jogador é preservado
- Reconexão via `room:rejoin` restaura mão, apostas e posição na mesa

### Sistema de Espectadores
- **Espectadores internos:** jogadores eliminados continuam na sala como espectadores, vendo todas as cartas
- **Espectadores externos:** qualquer pessoa pode entrar em uma partida em andamento via:
  - Hub de salas (`/rooms`) → seção "Partidas em Andamento" → botão "Assistir"
  - Link direto: `/game?spectate=CODIGOSALA` → solicita nome → entra como espectador
- Máximo de 10 espectadores por sala
- Chat mostra badge `[👁️]` ao lado do nome de mensagens enviadas por espectadores
- Widget recolhível no canto da tela lista todos os espectadores presentes

### Salas e Moderação
- Salas públicas e privadas; hub em `/rooms` lista lobbies abertos e partidas em andamento
- **Vote-kick:** inicia votação para expulsar um jogador (maioria simples, cooldown entre tentativas)
- **Host:** pode expulsar (`host:kick`) ou banir (`host:ban`) jogadores; bans persistem por `sessionId`
- Configurações da sala (máx. jogadores, vidas, regras) definidas pelo host antes de iniciar

### Encerramento de Partida
- Ao terminar, a sala fica ativa por **5 minutos** com contador regressivo visível
- Qualquer jogador ativo pode iniciar nova partida durante esse período
- Se todos desconectarem antes do timer, a sala é fechada imediatamente
- Ao fechar, clientes recebem `room:closed` e são redirecionados para a tela inicial

### Chat
- Mensagens em tempo real, sanitizadas no servidor
- Histórico das últimas 100 mensagens por sala
- Badge de espectador em mensagens de espectadores

---

## Eventos Socket.IO

### Sala
| Evento (cliente → servidor) | Descrição |
|---|---|
| `room:create` | Cria sala; responde com `room:created` (`roomId`, `sessionId`) |
| `room:join` | Entra numa sala pelo código |
| `room:rejoin` | Reconecta com `{ roomId, sessionId }` |
| `room:list` | Solicita lista de lobbies públicos |
| `room:listWatchable` | Solicita lista de partidas em andamento (para espectadores) |
| `room:joinAsSpectator` | Entra em partida em andamento como espectador |

### Jogo
| Evento | Descrição |
|---|---|
| `game:start` | Host inicia partida |
| `player:bet` | Envia aposta da rodada |
| `player:playCard` | Joga carta pelo índice |
| `player:quit` | Sai voluntariamente da sala |
| `game:stateUpdate` | (servidor → cliente) Estado completo para sincronização |
| `game:trickResult` | (servidor → cliente) Resultado da vaza |
| `game:roundEnd` | (servidor → cliente) Fim de rodada com pontuação |
| `game:over` | (servidor → cliente) Fim de partida com vencedor |
| `room:closed` | (servidor → cliente) Sala encerrada definitivamente |

### Chat
| Evento | Descrição |
|---|---|
| `chat:send` | Envia mensagem `{ roomId, text }` |
| `chat:message` | (servidor → cliente) `{ id, playerId, playerName, text, timestamp }` |

### Moderação
| Evento | Descrição |
|---|---|
| `vote:initiate` | Inicia votação para expulsão |
| `vote:cast` | Vota em votação ativa |
| `vote:update` | (servidor → cliente) Atualização do placar de votos |
| `vote:kickComplete` | (servidor → cliente) Resultado da votação |
| `host:kick` | Host expulsa jogador imediatamente |
| `host:ban` | Host bane jogador (persistente por `sessionId`) |

---

## Regras do Jogo (resumo)

1. Cada rodada distribui N cartas (começa em 1, aumenta até baralho acabar, volta)
2. Todos apostam quantas vazas vão ganhar; o último a apostar não pode fechar a soma exata
3. Ganha a vaza quem jogar a maior: manilha > cartas comuns (ordenadas por valor); naipes desempatam se `suitTiebreakerRule` ativo
4. **Vidas:** quem errar a aposta perde 1 vida; número de vidas configrável (padrão 3)
5. **FDP ativo:** se dois ou mais jogadores empatam na mesma vaza e todos acertaram a aposta, nenhum deles recebe a pontuação (amarração)
6. Vence quem sobrar com pelo menos 1 vida

Regras detalhadas em [docs/regras-jogo.md](docs/regras-jogo.md).

---

## Arquivos-Chave

| Arquivo | Responsabilidade |
|---|---|
| `backend/src/index.ts` | Todos os handlers de eventos Socket.IO |
| `backend/src/game/logic.ts` | Lógica central (vazas, FDP, manilhas, pontuação) |
| `backend/src/game/roomManager.ts` | Lifecycle de salas, reconexão, espectadores |
| `backend/src/db/rooms.ts` | Persistência SQLite |
| `frontend/hooks/useGame.ts` | Hook com estado completo do jogo + callbacks |
| `frontend/lib/gameContext.tsx` | Context React para compartilhar `useGame` |
| `frontend/app/game/page.tsx` | Interface principal do jogo |
| `frontend/app/rooms/page.tsx` | Hub de salas (lobbies + partidas ao vivo) |

