# Fodinha — Jogo de Cartas Multiplayer (PT-BR)

Este repositório contém uma implementação multiplayer em tempo real do jogo de cartas brasileiro "Fodinha" (variante parecida de Oh Hell!). O projeto tem um backend em TypeScript/Node (Express + Socket.IO) e um frontend em Next.js/React (app router) com cliente Socket.IO.

Visão geral
- Backend: Express + Socket.IO, TypeScript — código em `backend/src`.
- Frontend: Next.js + React + Socket.IO client — código em `frontend/app` e `frontend/components`.
- Projeto focado no modo de desenvolvimento local; rooms e bans são mantidos em memória (Map) por enquanto.

Funcionalidades principais
- Jogo em tempo real: apostas, jogo de vazas, cálculo de truques e pontuação (inclui regras FDP/amarração conforme especificado no projeto).
- Suporte a reconexão: cada jogador recebe um `sessionId` salvo no `localStorage` (chave `fodinha_session`) e tem uma janela de 30s para reconectar antes de ser eliminado.
- Salas públicas/privadas e hub de salas (`/rooms`) para descobrir e entrar em lobbies públicos.
- Chat por sala com sanitização no servidor e limite de histórico (últimas 100 mensagens).
- Moderação: voto para expulsar (vote-kick), host pode expulsar e banir (bans salvos por `sessionId`).
- Comportamentos de desconexão: no lobby a saída é imediata; em jogo há grace period de 30s.
- UI: componentes de jogo, destaque visual de carta vencedora, opção "eye" (mostrar/ocultar cartas), integração com `useGame` hook.

Como rodar (desenvolvimento)

- Backend

```bash
cd backend
npm install    # ou: bun install
npm run dev    # script de desenvolvimento (ver package.json)
```

- Frontend

```bash
cd frontend
npm install    # ou: bun install
npm run dev
```

Observações: você pode usar `bun` no lugar do `npm` se preferir (os scripts equivalentes estão disponíveis). O frontend espera a URL do backend em `NEXT_PUBLIC_BACKEND_URL` quando rodando em produção; em dev normalmente o cliente aponta para `http://localhost:PORT` onde o backend está escutando.

Eventos principais (Socket.IO)

Room / conexão
- `room:create` → cria sala (server responde `room:created` com `roomId` e `sessionId`).
- `room:join` → entra numa sala; servidor responde com `room:sessionInfo` e `game:stateUpdate`.
- `room:rejoin` → tenta reentrar usando `roomId` + `sessionId` (reconnect flow).
- `room:list` → pedido/atualização de salas públicas (server emite `room:list`).

Chat
- `chat:send` { roomId, text } → envia mensagem (servidor sanitiza e emite `chat:message`).
- `chat:message` → recebido por clientes: `{ id, playerId, playerName, text, timestamp }`.

Jogo
- `game:start` → host inicia partida.
- `player:bet` { roomId, bet } → aposta do jogador.
- `player:playCard` { roomId, cardIndex } → joga carta.
- `player:quit` { roomId } → sai voluntariamente.
- `game:stateUpdate` → estado completo do jogo para sincronização UI.
- `game:trickResult`, `game:roundEnd`, `game:over` → eventos de fim de truque/rodada/jogo.

Moderação / votação
- `vote:initiate`, `vote:cast`, `vote:update`, `vote:kickComplete` — fluxo de votação para expulsão.
- `host:kick` / `host:ban` — ações instantâneas do host (ban persiste por `sessionId`).

Sessões e bans
- `sessionId` é emitido pelo servidor e deve ser guardado no cliente. Bans são comparados por `sessionId` ao tentar reentrar.

Segurança e limitações atuais
- Sanitização básica de chat (escape HTML). Para produção, considere usar bibliotecas testadas para XSS/escaping.
- Dados de salas, ban-list e histórico de chat estão em memória — não são persistentes entre reinícios do servidor.

Melhorias recomendadas
- Persistir salas/bans em Redis ou SQLite para suportar múltiplas instâncias/reinícios.
- Adicionar salas protegidas por senha.
- Adicionar rate-limiting para prevenir spam no chat.
- Harden de validações de entrada (ex.: limites mais estritos e checagens adicionais no servidor).

Arquivos importantes
- Backend: `backend/src/index.ts`, `backend/src/game/roomManager.ts`, `backend/src/game/logic.ts`, `backend/src/game/deck.ts`.
- Frontend: `frontend/hooks/useGame.ts`, `frontend/components/Chat.tsx`, `frontend/app/rooms/page.tsx`, `frontend/app/game/page.tsx`.

