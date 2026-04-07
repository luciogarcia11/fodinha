"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage, Player } from "@/lib/types";

import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react';

export default function Chat({
  messages,
  send,
  compact = false,
  global = false,
  players,
}: {
  messages: ChatMessage[];
  send: (text: string) => void;
  compact?: boolean;
  global?: boolean;
  players?: Player[];
}) {
  const [text, setText] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(global);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lastReadCount, setLastReadCount] = useState(messages.length);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dividerRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = isCollapsed ? messages.length - lastReadCount : 0;

  useEffect(() => {
    if (!isCollapsed) {
      // When expanded, scroll to divider if exists, otherwise scroll to bottom
      if (dividerRef.current) {
        dividerRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
  }, [isCollapsed]);

  useEffect(() => {
    if (!isCollapsed) {
      // Mark all as read when open and new messages arrive
      setLastReadCount(messages.length);
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
  }, [messages, isCollapsed]);

  function handleSend() {
    const t = text.trim();
    if (!t) return;
    send(t.slice(0, 200));
    setText("");
    setShowEmojiPicker(false);
  }

  function onEmojiClick(emojiData: EmojiClickData) {
    setText(prev => prev + emojiData.emoji);
  }

  if (isCollapsed) {
    return (
      <button
        className="w-11 h-11 rounded-full bg-black/50 hover:bg-black/70 border border-white/20 shadow-xl flex items-center justify-center transition-all backdrop-blur-md relative"
        onClick={() => setIsCollapsed(false)}
        title="Abrir chat"
      >
        <span className="text-xl">{global ? "🌐" : "💬"}</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={`flex flex-col bg-black/20 rounded-xl ${compact ? "w-60" : "w-80"} shadow-xl border border-white/10 backdrop-blur-md transition-all`}>
      {/* Header com botão de colapsar */}
      <div 
        className="flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-colors rounded-t-xl"
        onClick={() => setIsCollapsed(true)}
      >
        <span className="text-white/80 text-sm font-semibold">
          {global ? "🌐 Global" : "💬 Sala"}
        </span>
        <button
          className="text-white/60 hover:text-white transition-colors text-sm"
          title="Colapsar chat"
        >
          ▼
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto max-h-80 space-y-3 p-3 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        {messages.map((m, i) => (
          <div key={m.id}>
            {i === lastReadCount && lastReadCount > 0 && lastReadCount < messages.length && (
              <div ref={dividerRef} className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-red-400/50" />
                <span className="text-red-400/70 text-[10px] font-bold uppercase">Novas</span>
                <div className="flex-1 h-px bg-red-400/50" />
              </div>
            )}
            <div className="text-[13px] leading-tight flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-yellow-400/90 font-bold truncate">
                {players?.find(p => p.id === m.playerId)?.isSpectator && <span className="text-indigo-400 mr-0.5" title="Espectador">[👁️]</span>}
                {m.playerName}
              </span>
              <span className="text-white/30 text-[9px] whitespace-nowrap">
                {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : m.createdAt ? new Date(m.createdAt * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
            <div className="text-white/90 break-words">{m.text}</div>
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-white/40 text-sm text-center py-4 italic">
            {global ? "Inicie a conversa no chat global!" : "Seja legal — inicie a conversa!"}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-2 border-t border-white/10 bg-black/20 rounded-b-xl relative">
        <div className="flex gap-1.5 items-center">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors p-2 rounded-md shrink-0 flex items-center justify-center font-bold relative"
            title="Emojis"
          >
            😀
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Escreva algo..."
            className="flex-1 bg-white/5 text-white placeholder-white/40 px-3 py-2 rounded-md outline-none focus:ring-1 focus:ring-yellow-400 text-sm min-w-0"
            maxLength={200}
          />
          <button
            onClick={handleSend}
            className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold px-3 py-2 rounded-md text-sm shrink-0"
            title="Enviar"
          >
            ➤
          </button>
        </div>

        {/* Emoji picker menu */}
        {showEmojiPicker && (
          <div className="absolute bottom-full right-0 mb-2 mr-2 z-50 shadow-2xl">
            <EmojiPicker 
              onEmojiClick={onEmojiClick}
              theme={Theme.DARK}
              width={280}
              height={350}
              searchDisabled={true}
              skinTonesDisabled={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
