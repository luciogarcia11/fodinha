"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/lib/types";

const EMOJIS = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤔',
  '😢', '😭', '😡', '🤬', '😱', '🤯', '🥶', '🥵',
  '👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '👆',
  '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '👑', '💀',
  '❤️', '💔', '💯', '🔥', '⭐', '💫', '🌟', '✨',
  '🃏', '♠️', '♥️', '♣️', '♦️', '🎯', '🎲', '🎪',
];

export default function Chat({
  messages,
  send,
  sendReaction,
  compact = false,
  global = false,
}: {
  messages: ChatMessage[];
  send: (text: string) => void;
  sendReaction?: (emoji: string) => void;
  compact?: boolean;
  global?: boolean;
}) {
  const [text, setText] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current && !isCollapsed) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isCollapsed]);

  function handleSend() {
    const t = text.trim();
    if (!t) return;
    send(t.slice(0, 200));
    setText("");
  }

  function handleEmojiClick(emoji: string) {
    if (sendReaction) {
      sendReaction(emoji);
      setShowEmojiPicker(false);
    } else {
      setText(prev => prev + emoji);
    }
  }

  return (
    <div className={`flex flex-col bg-black/60 rounded-xl ${compact ? "w-60" : "w-80"}`}>
      {/* Header com botão de colapsar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-white/10">
        <span className="text-white/60 text-xs font-medium">
          {global ? "🌐 Chat Global" : "💬 Chat da Sala"}
        </span>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-white/60 hover:text-white transition-colors text-sm"
          title={isCollapsed ? "Expandir chat" : "Colapsar chat"}
        >
          {isCollapsed ? "💬" : "✕"}
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div ref={listRef} className="flex-1 overflow-y-auto max-h-72 space-y-2 p-2">
            {messages.map((m) => (
              <div key={m.id} className="text-[13px]">
                <div className="text-white/80 font-semibold">{m.playerName}</div>
                <div className="text-white/90 break-words">{m.text}</div>
                <div className="text-white/30 text-[10px]">
                  {m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : new Date(m.createdAt * 1000).toLocaleTimeString()}
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="text-white/40 text-sm">
                {global ? "Seja bem-vindo ao chat global!" : "Seja legal — seja bem-vindo ao chat!"}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 p-2 border-t border-white/10">
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Digite uma mensagem"
                className="flex-1 bg-white/5 text-white placeholder-white/40 px-3 py-2 rounded-md outline-none focus:ring-2 focus:ring-yellow-400 text-sm"
                maxLength={200}
              />
              <button
                onClick={handleSend}
                className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold px-3 py-2 rounded-md text-sm whitespace-nowrap"
              >
                Enviar
              </button>
            </div>

            {/* Emoji picker button */}
            {sendReaction && (
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors px-3 py-1.5 rounded-md text-sm text-left flex items-center gap-2"
                >
                  😀 Reações rápidas
                </button>

                {showEmojiPicker && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-900 rounded-lg border border-white/20 p-2 grid grid-cols-8 gap-1 z-50">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleEmojiClick(emoji)}
                        className="text-xl hover:scale-125 transition-transform p-1"
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
