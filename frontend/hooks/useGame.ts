"use client";

import { useEffect, useState, useCallback } from "react";
import { socket } from "@/lib/socket";
import { GameState, TrickResult, RoundEndData } from "@/lib/types";

export function useGame() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [roomId, setRoomId] = useState<string>("");
  const [myId, setMyId] = useState<string>("");
  const [trickResult, setTrickResult] = useState<TrickResult | null>(null);
  const [roundEnd, setRoundEnd] = useState<RoundEndData | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setMyId(socket.id ?? "");
    });

    socket.on(
      "room:created",
      ({ roomId, state }: { roomId: string; state: GameState }) => {
        setRoomId(roomId);
        setGameState(state);
      },
    );

    socket.on("game:stateUpdate", (state: GameState) => {
      setGameState(state);
      setTrickResult(null);
    });

    socket.on("game:trickResult", (result: TrickResult) => {
      setTrickResult(result);
    });

    socket.on("game:roundEnd", (data: RoundEndData) => {
      setRoundEnd(data);
    });

    socket.on("game:over", ({ winnerId }: { winnerId: string }) => {
      setWinnerId(winnerId);
    });

    socket.on("room:error", ({ message }: { message: string }) => {
      setError(message);
    });

    socket.on("game:playerQuit", ({ playerName }: { playerName: string }) => {
      console.log(`${playerName} saiu da partida`);
    });

    return () => {
      socket.off("connect");
      socket.off("room:created");
      socket.off("game:stateUpdate");
      socket.off("game:trickResult");
      socket.off("game:roundEnd");
      socket.off("game:over");
      socket.off("room:error");
      socket.off("game:playerQuit");
    };
  }, []);

  const createRoom = useCallback((name: string) => {
    socket.emit("room:create", { name });
  }, []);

  const joinRoom = useCallback((code: string, name: string) => {
    socket.emit("room:join", { roomId: code.toUpperCase(), name });
    setRoomId(code.toUpperCase());
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

  const clearRoundEnd = useCallback(() => setRoundEnd(null), []);
  const clearError = useCallback(() => setError(""), []);

  const quitGame = useCallback(() => {
    if (roomId) {
      socket.emit("player:quit", { roomId });
    }
  }, [roomId]);

  return {
    gameState,
    roomId,
    myId,
    trickResult,
    roundEnd,
    winnerId,
    error,
    createRoom,
    joinRoom,
    startGame,
    placeBet,
    playCard,
    updateConfig,
    clearRoundEnd,
    clearError,
    quitGame,
  };
}
