"use client";

import { useEffect, useState, useCallback } from "react";
import { socket } from "@/lib/socket";
import { GameState, TrickResult, RoundEndData, VoteStartedData, VoteUpdateData, ChatMessage, PublicRoomInfo, WatchableRoomInfo, Reaction } from "@/lib/types";

const SESSION_KEY = "fodinha_session";

interface SessionData {
  roomId: string;
  sessionId: string;
  playerName: string;
}

function saveSession(data: SessionData) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
}

function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function useGame() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [roomId, setRoomId] = useState<string>("");
  const [myId, setMyId] = useState<string>("");
  const [trickResult, setTrickResult] = useState<TrickResult | null>(null);
  const [roundEnd, setRoundEnd] = useState<RoundEndData | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [playerQuitName, setPlayerQuitName] = useState<string | null>(null);
  const [playerReconnectedName, setPlayerReconnectedName] = useState<string | null>(null);
  const [playerDisconnectedName, setPlayerDisconnectedName] = useState<string | null>(null);
  const [kicked, setKicked] = useState<string | null>(null);
  const [voteKick, setVoteKick] = useState<VoteStartedData | null>(null);
  const [voteUpdate, setVoteUpdate] = useState<VoteUpdateData | null>(null);
  const [voteComplete, setVoteComplete] = useState<{ targetName: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [globalChatMessages, setGlobalChatMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [publicRooms, setPublicRooms] = useState<PublicRoomInfo[]>([]);
  const [watchableRooms, setWatchableRooms] = useState<WatchableRoomInfo[]>([]);
  const [voteKickCooldownUntil, setVoteKickCooldownUntil] = useState<number>(0);
  const [gameOverAt, setGameOverAt] = useState<number>(0);
  const [joinedAsSpectator, setJoinedAsSpectator] = useState<string | null>(null);
  const [spectatorQueuePosition, setSpectatorQueuePosition] = useState<number>(0);
  const [promotedNames, setPromotedNames] = useState<string[] | null>(null);

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      console.log('[useGame] Socket conectado:', socket.id);
      setMyId(socket.id ?? "");

      // SÓ tenta rejoin se houver sessão salva E estiver na página de lobby/game
      // NÃO tenta se o usuário saiu voluntariamente
      const session = loadSession();
      const currentPath = window.location.pathname;

      if (session && (currentPath === '/lobby' || currentPath === '/game')) {
        console.log('[useGame] Tentando reconectar com sessão:', session);
        socket.emit("room:rejoin", {
          roomId: session.roomId,
          sessionId: session.sessionId,
        });
      }
    });

    // Listener para falha de rejoin
    socket.on("room:rejoinFailed", ({ message }: { message: string }) => {
      console.log('[useGame] Rejoin falhou:', message);
      clearSession();
    });

    socket.on(
      "room:created",
      ({ roomId, state, sessionId }: { roomId: string; state: GameState; sessionId?: string }) => {
        setRoomId(roomId);
        setGameState(state);
        if (sessionId) {
          const me = state.players.find(p => p.id === socket.id);
          saveSession({ roomId, sessionId, playerName: me?.name ?? "" });
        }
      },
    );

    socket.on("room:sessionInfo", ({ sessionId }: { sessionId?: string }) => {
      console.log('[useGame] Session info recebido:', sessionId);
      if (sessionId) {
        const session = loadSession();
        // Atualiza sessionId mantendo roomId
        saveSession({
          roomId: session?.roomId ?? "",
          sessionId,
          playerName: session?.playerName ?? "",
        });
      }
    });

    // Listener para ser kickado (limpa sessão imediatamente)
    socket.on("game:kicked", ({ message }: { message: string }) => {
      console.log('[useGame] Kickado:', message);
      setKicked(message);
      clearSession();
    });

    socket.on("game:stateUpdate", (state: GameState) => {
      console.log('[useGame] State update recebido:', state.roomId, state.phase);
      setGameState(state);
      setTrickResult(null);

      // Atualiza roomId se necessário (para reconnect)
      if (state.roomId && state.roomId !== roomId) {
        setRoomId(state.roomId);
      }

      // Atualiza sessão com novo roomId e sessionId
      const me = state.players.find(p => p.id === socket.id);
      if (me && me.sessionId) {
        saveSession({
          roomId: state.roomId,
          sessionId: me.sessionId,
          playerName: me.name,
        });
      }
    });

    socket.on("game:trickResult", (result: TrickResult) => {
      setTrickResult(result);
    });

    socket.on("game:roundEnd", (data: RoundEndData) => {
      setRoundEnd(data);
    });

    socket.on("game:over", ({ winnerId }: { winnerId: string }) => {
      setWinnerId(winnerId);
      setGameOverAt(Date.now());
      clearSession();
    });

    socket.on("room:closed", () => {
      clearSession();
      window.location.href = "/";
    });

    socket.on("room:error", ({ message }: { message: string }) => {
      setError(message);
    });

    socket.on("game:playerQuit", ({ playerName }: { playerName: string }) => {
      setPlayerQuitName(playerName);
    });

    socket.on("game:playerDisconnected", ({ playerName }: { playerName: string }) => {
      setPlayerDisconnectedName(playerName);
    });

    socket.on("game:playerReconnected", ({ playerName }: { playerName: string }) => {
      setPlayerReconnectedName(playerName);
    });

    // Vote-kick events
    socket.on("vote:started", (data: VoteStartedData) => {
      setVoteKick(data);
      setVoteUpdate({ votes: data.votes, needed: data.needed });
    });

    socket.on("vote:update", (data: VoteUpdateData) => {
      setVoteUpdate(data);
    });

    socket.on("vote:kickComplete", ({ targetName }: { targetName: string }) => {
      setVoteComplete({ targetName });
      setVoteKick(null);
      setVoteUpdate(null);
    });

    socket.on("vote:expired", () => {
      setVoteKick(null);
      setVoteUpdate(null);
    });

    socket.on("chat:message", (message: ChatMessage) => {
      setChatMessages(prev => {
        const next = [...prev, message];
        return next.length > 100 ? next.slice(-100) : next;
      });
    });

    socket.on("room:list", (rooms: PublicRoomInfo[]) => {
      setPublicRooms(rooms);
    });

    socket.on("room:listWatchable", (rooms: WatchableRoomInfo[]) => {
      setWatchableRooms(rooms);
    });

    socket.on("global:chat", (message: ChatMessage) => {
      setGlobalChatMessages(prev => {
        const next = [...prev, message];
        return next.length > 50 ? next.slice(-50) : next;
      });
    });

    socket.on("reaction:new", (reaction: Reaction) => {
      setReactions(prev => [...prev, reaction]);
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r !== reaction));
      }, 3000); // Remove after 3 seconds
    });

    socket.on("room:joinedAsSpectator", ({ message }: { message: string }) => {
      setJoinedAsSpectator(message);
    });

    socket.on("spectator:queueUpdate", (positions: Array<{ playerId: string; position: number }>) => {
      const myPos = positions.find(p => p.playerId === socket.id);
      setSpectatorQueuePosition(myPos?.position ?? 0);
    });

    socket.on("spectator:promoted", ({ names }: { names: string[] }) => {
      setPromotedNames(names);
    });

    return () => {
      socket.off("connect");
      socket.off("room:created");
      socket.off("room:sessionInfo");
      socket.off("room:rejoinFailed");
      socket.off("game:stateUpdate");
      socket.off("game:trickResult");
      socket.off("game:roundEnd");
      socket.off("game:over");
      socket.off("room:closed");
      socket.off("room:error");
      socket.off("game:playerQuit");
      socket.off("game:playerDisconnected");
      socket.off("game:playerReconnected");
      socket.off("game:kicked");
      socket.off("vote:started");
      socket.off("vote:update");
      socket.off("vote:kickComplete");
      socket.off("vote:expired");
      socket.off("chat:message");
      socket.off("room:list");
      socket.off("room:listWatchable");
      socket.off("global:chat");
      socket.off("reaction:new");
      socket.off("room:joinedAsSpectator");
      socket.off("spectator:queueUpdate");
      socket.off("spectator:promoted");
    };
  }, [roomId]);

  // Attempt to notify server on tab/window close so the room updates immediately.
  useEffect(() => {
    function handleBeforeUnload() {
      if (roomId) {
        try {
          socket.emit("player:quit", { roomId });
        } catch {}
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [roomId]);

  const createRoom = useCallback((name: string) => {
    socket.emit("room:create", { name });
  }, []);

  const joinRoom = useCallback((code: string, name: string) => {
    const rid = code.toUpperCase();
    socket.emit("room:join", { roomId: rid, name });
    setRoomId(rid);
    // Session será salvo quando recebermos room:sessionInfo
    const session = loadSession();
    saveSession({ roomId: rid, sessionId: session?.sessionId ?? "", playerName: name });
  }, []);

  const joinAsSpectator = useCallback((code: string, name: string) => {
    const rid = code.toUpperCase();
    socket.emit("room:joinAsSpectator", { roomId: rid, name });
    setRoomId(rid);
    const session = loadSession();
    saveSession({ roomId: rid, sessionId: session?.sessionId ?? "", playerName: name });
  }, []);

  const startGame = useCallback(() => {
    socket.emit("game:start", { roomId });
  }, [roomId]);

  const placeBet = useCallback(
    (bet: number) => {
      socket.emit("player:bet", { roomId, bet });
    },
    [roomId],
  );

  const playCard = useCallback(
    (cardIndex: number) => {
      socket.emit("player:playCard", { roomId, cardIndex });
    },
    [roomId],
  );

  const updateConfig = useCallback(
    (config: Partial<GameState["config"]>) => {
      socket.emit("game:config", { roomId, config });
    },
    [roomId],
  );

  const initiateVoteKick = useCallback(
    (targetId: string) => {
      socket.emit("vote:initiate", { roomId, targetId });
      setVoteKickCooldownUntil(Date.now() + 60_000);
    },
    [roomId],
  );

  const castVoteKick = useCallback(() => {
    socket.emit("vote:cast", { roomId });
  }, [roomId]);

  const hostBan = useCallback(
    (targetId: string) => {
      socket.emit("host:ban", { roomId, targetId });
    },
    [roomId],
  );

  const hostKick = useCallback(
    (targetId: string) => {
      socket.emit("host:kick", { roomId, targetId });
    },
    [roomId],
  );

  const clearRoundEnd = useCallback(() => setRoundEnd(null), []);
  const clearError = useCallback(() => setError(""), []);
  const clearPlayerQuit = useCallback(() => setPlayerQuitName(null), []);
  const clearPlayerReconnected = useCallback(() => setPlayerReconnectedName(null), []);
  const clearPlayerDisconnected = useCallback(() => setPlayerDisconnectedName(null), []);
  const clearVoteComplete = useCallback(() => setVoteComplete(null), []);

  const sendChat = useCallback(
    (text: string) => {
      if (roomId && text.trim()) {
        socket.emit("chat:send", { roomId, text: text.trim() });
      }
    },
    [roomId],
  );

  const fetchRooms = useCallback(() => {
    socket.emit("room:list");
  }, []);

  const fetchWatchableRooms = useCallback(() => {
    socket.emit("room:listWatchable");
  }, []);

  const sendGlobalChat = useCallback((text: string) => {
    socket.emit("global:chat", { text });
  }, []);

  const sendReaction = useCallback((roomId: string, emoji: string) => {
    socket.emit("reaction:send", { roomId, emoji });
  }, []);

  const quitGame = useCallback(() => {
    if (roomId) {
      socket.emit("player:quit", { roomId });
      clearSession();
      setChatMessages([]);
    }
  }, [roomId]);

  const leaveRoom = useCallback(() => {
    if (roomId) {
      socket.emit("room:leave", { roomId });
    }
    clearSession();
    setChatMessages([]);
    setRoomId("");
    setGameState(null);
  }, [roomId]);

  const becomeSpectator = useCallback(() => {
    if (roomId) {
      socket.emit("player:becomeSpectator", { roomId });
    }
  }, [roomId]);

  const joinQueue = useCallback(() => {
    if (roomId) {
      socket.emit("spectator:joinQueue", { roomId });
    }
  }, [roomId]);

  const leaveQueue = useCallback(() => {
    if (roomId) {
      socket.emit("spectator:leaveQueue", { roomId });
      setSpectatorQueuePosition(0);
    }
  }, [roomId]);

  const clearJoinedAsSpectator = useCallback(() => setJoinedAsSpectator(null), []);
  const clearPromotedNames = useCallback(() => setPromotedNames(null), []);

  return {
    gameState,
    roomId,
    myId,
    trickResult,
    roundEnd,
    winnerId,
    error,
    playerQuitName,
    playerReconnectedName,
    playerDisconnectedName,
    kicked,
    voteKick,
    voteUpdate,
    voteComplete,
    chatMessages,
    globalChatMessages,
    reactions,
    publicRooms,
    watchableRooms,
    joinedAsSpectator,
    spectatorQueuePosition,
    promotedNames,
    createRoom,
    joinRoom,
    joinAsSpectator,
    startGame,
    placeBet,
    playCard,
    updateConfig,
    initiateVoteKick,
    castVoteKick,
    hostBan,
    hostKick,
    clearRoundEnd,
    clearError,
    clearPlayerQuit,
    clearPlayerReconnected,
    clearPlayerDisconnected,
    clearVoteComplete,
    sendChat,
    sendGlobalChat,
    sendReaction,
    fetchRooms,
    fetchWatchableRooms,
    quitGame,
    leaveRoom,
    becomeSpectator,
    joinQueue,
    leaveQueue,
    clearJoinedAsSpectator,
    clearPromotedNames,
    voteKickCooldownUntil,
    gameOverAt,
  };
}
