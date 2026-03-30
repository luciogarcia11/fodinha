import { db } from './schema';
import { GameState, Player, GameConfig, ChatMessage, TrickState } from '../types';
import { buildDeck, buildMultiDeck, shuffleDeck, dealCards } from '../game/deck';
import { getCardsForRound } from '../game/logic';
import crypto from 'crypto';

export function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

export function generateSessionId(): string {
  return crypto.randomUUID();
}

// Save room to database
export function saveRoom(state: GameState): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO rooms (
      id, host_id, host_name, phase, round, cards_this_round, ascending,
      current_turn, trick_leader, trick_number, dealer_index,
      resolving_trick, is_public, last_activity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    state.roomId,
    state.hostId,
    state.hostName,
    state.phase,
    state.round,
    state.cardsThisRound,
    state.ascending ? 1 : 0,
    state.currentTurn,
    state.trickLeader,
    state.trickNumber,
    state.dealerIndex,
    state.resolvingTrick ? 1 : 0,
    state.config.isPublic ? 1 : 0,
    Math.floor(Date.now() / 1000)
  );

  // Save room config
  const configStmt = db.prepare(`
    INSERT OR REPLACE INTO room_configs (
      room_id, lives_per_player, fdp_rule, card_on_forehead_rule,
      suit_tiebreaker_rule, max_rounds
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  configStmt.run(
    state.roomId,
    state.config.livesPerPlayer,
    state.config.fdpRule ? 1 : 0,
    state.config.cardOnForeheadRule ? 1 : 0,
    state.config.suitTiebreakerRule ? 1 : 0,
    state.config.maxRounds
  );

  // Save players
  const deletePlayersStmt = db.prepare('DELETE FROM players WHERE room_id = ?');
  deletePlayersStmt.run(state.roomId);

  const insertPlayerStmt = db.prepare(`
    INSERT INTO players (
      id, room_id, name, lives, hand, connected, is_eliminated, session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPlayer = db.transaction((player: Player) => {
    insertPlayerStmt.run(
      player.id,
      state.roomId,
      player.name,
      player.lives,
      JSON.stringify(player.hand),
      player.connected ? 1 : 0,
      player.isEliminated ? 1 : 0,
      player.sessionId
    );
  });

  state.players.forEach(insertPlayer);
}

// Load room from database
export function loadRoom(roomId: string): GameState | null {
  const roomStmt = db.prepare('SELECT * FROM rooms WHERE id = ?');
  const room = roomStmt.get(roomId) as any;

  if (!room) return null;

  const configStmt = db.prepare('SELECT * FROM room_configs WHERE room_id = ?');
  const configRow = configStmt.get(roomId) as any;

  const config: GameConfig = {
    livesPerPlayer: configRow?.lives_per_player || 3,
    fdpRule: !!configRow?.fdp_rule,
    cardOnForeheadRule: !!configRow?.card_on_forehead_rule,
    suitTiebreakerRule: !!configRow?.suit_tiebreaker_rule,
    maxRounds: configRow?.max_rounds || 0,
    isPublic: !!room.is_public,
  };

  const playersStmt = db.prepare('SELECT * FROM players WHERE room_id = ?');
  const playersRows = playersStmt.all(roomId) as any[];

  const players: Player[] = playersRows.map(row => ({
    id: row.id,
    name: row.name,
    lives: row.lives,
    hand: JSON.parse(row.hand),
    connected: !!row.connected,
    isEliminated: !!row.is_eliminated,
    sessionId: row.session_id,
  }));

  const chatStmt = db.prepare('SELECT * FROM room_chat WHERE room_id = ? ORDER BY timestamp DESC LIMIT 100');
  const chatRows = chatStmt.all(roomId) as any[];
  const chatMessages: ChatMessage[] = chatRows.reverse().map(row => ({
    id: row.id,
    playerId: row.player_id,
    playerName: row.player_name,
    text: row.text,
    timestamp: row.timestamp,
  }));

  return {
    roomId: room.id,
    hostId: room.host_id,
    hostName: room.host_name,
    phase: room.phase,
    round: room.round,
    cardsThisRound: room.cards_this_round,
    ascending: !!room.ascending,
    players,
    currentTurn: room.current_turn || '',
    bettingOrder: [], // Will be reconstructed
    bets: {},
    tricksTaken: {},
    currentTrick: [],
    trickLeader: room.trick_leader || room.host_id,
    trickNumber: room.trick_number,
    dealerIndex: room.dealer_index,
    resolvingTrick: !!room.resolving_trick,
    config,
    trickState: null,
    activeVoteKick: null,
    bannedIds: getBannedPlayers(roomId),
    chatMessages,
  };
}

// Delete room from database
export function deleteRoom(roomId: string): void {
  db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
}

// List all public rooms in lobby phase
export function listPublicRooms(): Array<{
  roomId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  config: GameConfig;
}> {
  const stmt = db.prepare(`
    SELECT r.*, c.*
    FROM rooms r
    LEFT JOIN room_configs c ON r.id = c.room_id
    WHERE r.phase = 'lobby' AND r.is_public = 1
    ORDER BY r.created_at DESC
  `);

  const rows = stmt.all() as any[];

  return rows.map(row => ({
    roomId: row.id,
    hostName: row.host_id, // We'll get this from players
    playerCount: getPlayerCount(row.id),
    maxPlayers: 10,
    config: {
      livesPerPlayer: row.lives_per_player || 3,
      fdpRule: !!row.fdp_rule,
      cardOnForeheadRule: !!row.card_on_forehead_rule,
      suitTiebreakerRule: !!row.suit_tiebreaker_rule,
      maxRounds: row.max_rounds || 0,
      isPublic: true,
    },
  }));
}

function getPlayerCount(roomId: string): number {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM players WHERE room_id = ?');
  const result = stmt.get(roomId) as any;
  return result?.count || 0;
}

// Ban player (persistent across sessions)
export function banPlayer(roomId: string, sessionId: string, bannedBy: string, reason?: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO banned_players (room_id, session_id, banned_by, reason)
    VALUES (?, ?, ?, ?)
  `).run(roomId, sessionId, bannedBy, reason);
}

// Check if player is banned
export function isPlayerBanned(roomId: string, sessionId: string): boolean {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM banned_players WHERE room_id = ? AND session_id = ?');
  const result = stmt.get(roomId, sessionId) as any;
  return (result?.count || 0) > 0;
}

// Get all banned session IDs for a room
export function getBannedPlayers(roomId: string): string[] {
  const stmt = db.prepare('SELECT session_id FROM banned_players WHERE room_id = ?');
  const rows = stmt.all(roomId) as any[];
  return rows.map(row => row.session_id);
}

// Unban player
export function unbanPlayer(roomId: string, sessionId: string): void {
  db.prepare('DELETE FROM banned_players WHERE room_id = ? AND session_id = ?').run(roomId, sessionId);
}

// Add chat message to room
export function addRoomChatMessage(
  roomId: string,
  playerId: string,
  playerName: string,
  text: string
): ChatMessage {
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    roomId,
    playerId,
    playerName,
    text,
    timestamp: Date.now(),
  };

  db.prepare(`
    INSERT INTO room_chat (id, room_id, player_id, player_name, text, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(message.id, message.roomId, message.playerId, message.playerName, message.text, message.timestamp);

  return message;
}

// Add reaction to room
export function addRoomReaction(roomId: string, playerId: string, emoji: string): void {
  db.prepare(`
    INSERT INTO room_reactions (room_id, player_id, emoji)
    VALUES (?, ?, ?)
  `).run(roomId, playerId, emoji);
}

// Get recent reactions for a room
export function getRoomReactions(roomId: string): any[] {
  const stmt = db.prepare(`
    SELECT * FROM room_reactions
    WHERE room_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `);
  return stmt.all(roomId);
}

// Rate limiting
export function checkRateLimit(
  playerId: string,
  roomId: string | undefined,
  action: string,
  maxRequests: number,
  windowSeconds: number
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;

  // Clean old rate limits
  db.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(windowStart);

  // Get current count
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM rate_limits
    WHERE player_id = ? AND room_id IS ? AND action = ? AND window_start > ?
  `);
  const result = stmt.get(playerId, roomId, action, windowStart) as any;
  const count = result?.count || 0;

  if (count >= maxRequests) {
    return false; // Rate limit exceeded
  }

  // Increment counter
  db.prepare(`
    INSERT OR REPLACE INTO rate_limits (player_id, room_id, action, count, window_start)
    VALUES (?, ?, ?, COALESCE((SELECT count FROM rate_limits WHERE player_id = ? AND room_id IS ? AND action = ? AND window_start = ?), 0) + 1, ?)
  `).run(playerId, roomId, action, playerId, roomId, action, now, now);

  return true;
}

// Update room last activity
export function updateRoomActivity(roomId: string): void {
  db.prepare('UPDATE rooms SET last_activity = ? WHERE id = ?').run(
    Math.floor(Date.now() / 1000),
    roomId
  );
}

// Cleanup inactive rooms (older than 1 hour and in lobby)
export function cleanupInactiveRooms(): number {
  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
  const result = db.prepare('DELETE FROM rooms WHERE last_activity < ? AND phase = "lobby"').run(oneHourAgo);
  return result.changes;
}
