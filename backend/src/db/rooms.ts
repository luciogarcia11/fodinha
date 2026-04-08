import { pool } from './schema';
import { GameState, Player, GameConfig, ChatMessage } from '../types';
import { buildMultiDeck, shuffleDeck, dealCards } from '../game/deck';
import crypto from 'crypto';

// ─── Room persistence ─────────────────────────────────────────────────────────

export async function saveRoom(state: GameState): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO rooms (
         id, host_id, host_name, phase, round, cards_this_round, ascending,
         current_turn, trick_leader, trick_number, dealer_index,
         resolving_trick, is_public, last_activity
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         host_id          = EXCLUDED.host_id,
         host_name        = EXCLUDED.host_name,
         phase            = EXCLUDED.phase,
         round            = EXCLUDED.round,
         cards_this_round = EXCLUDED.cards_this_round,
         ascending        = EXCLUDED.ascending,
         current_turn     = EXCLUDED.current_turn,
         trick_leader     = EXCLUDED.trick_leader,
         trick_number     = EXCLUDED.trick_number,
         dealer_index     = EXCLUDED.dealer_index,
         resolving_trick  = EXCLUDED.resolving_trick,
         is_public        = EXCLUDED.is_public,
         last_activity    = EXCLUDED.last_activity`,
      [
        state.roomId, state.hostId, state.hostName, state.phase,
        state.round, state.cardsThisRound, state.ascending,
        state.currentTurn ?? null, state.trickLeader ?? null,
        state.trickNumber, state.dealerIndex, state.resolvingTrick,
        state.config.isPublic, Math.floor(Date.now() / 1000),
      ],
    );

    await client.query(
      `INSERT INTO room_configs (
         room_id, lives_per_player, fdp_rule, fdp_start_double_deck,
         card_on_forehead_rule, suit_tiebreaker_rule, max_rounds,
         deck_count, max_players, force_two_decks, insanity_mode
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (room_id) DO UPDATE SET
         lives_per_player      = EXCLUDED.lives_per_player,
         fdp_rule              = EXCLUDED.fdp_rule,
         fdp_start_double_deck = EXCLUDED.fdp_start_double_deck,
         card_on_forehead_rule = EXCLUDED.card_on_forehead_rule,
         suit_tiebreaker_rule  = EXCLUDED.suit_tiebreaker_rule,
         max_rounds            = EXCLUDED.max_rounds,
         deck_count            = EXCLUDED.deck_count,
         max_players           = EXCLUDED.max_players,
         force_two_decks       = EXCLUDED.force_two_decks,
         insanity_mode         = EXCLUDED.insanity_mode`,
      [
        state.roomId,
        state.config.livesPerPlayer, state.config.fdpRule,
        state.config.fdpStartDoubleDeck, state.config.cardOnForeheadRule,
        state.config.suitTiebreakerRule, state.config.maxRounds,
        state.config.deckCount, state.config.maxPlayers,
        state.config.forceTwoDecks, state.config.insanityMode,
      ],
    );

    await client.query('DELETE FROM players WHERE room_id = $1', [state.roomId]);

    for (const player of state.players) {
      await client.query(
        `INSERT INTO players
           (id, room_id, name, lives, hand, connected, is_eliminated,
            session_id, is_spectator, was_kicked)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          player.id, state.roomId, player.name, player.lives,
          JSON.stringify(player.hand), player.connected,
          player.isEliminated, player.sessionId,
          player.isSpectator, player.wasKicked,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updatePlayerSocketId(
  roomId: string,
  oldSocketId: string,
  newSocketId: string,
): Promise<void> {
  await pool.query(
    'UPDATE players SET id = $1 WHERE id = $2 AND room_id = $3',
    [newSocketId, oldSocketId, roomId],
  );
}

export async function loadRoom(roomId: string): Promise<GameState | null> {
  const { rows: roomRows } = await pool.query(
    'SELECT * FROM rooms WHERE id = $1',
    [roomId],
  );
  if (!roomRows.length) return null;
  const room = roomRows[0];

  const { rows: cfgRows } = await pool.query(
    'SELECT * FROM room_configs WHERE room_id = $1',
    [roomId],
  );
  const cfg = cfgRows[0];

  const config: GameConfig = {
    livesPerPlayer:      cfg?.lives_per_player      ?? 3,
    fdpRule:             cfg?.fdp_rule              ?? false,
    fdpStartDoubleDeck:  cfg?.fdp_start_double_deck ?? false,
    cardOnForeheadRule:  cfg?.card_on_forehead_rule  ?? true,
    suitTiebreakerRule:  cfg?.suit_tiebreaker_rule   ?? false,
    maxRounds:           cfg?.max_rounds             ?? 0,
    isPublic:            room.is_public              ?? true,
    deckCount:           cfg?.deck_count             ?? 1,
    maxPlayers:          cfg?.max_players            ?? 14,
    forceTwoDecks:       cfg?.force_two_decks        ?? false,
    insanityMode:        cfg?.insanity_mode          ?? false,
  };

  const { rows: playerRows } = await pool.query(
    'SELECT * FROM players WHERE room_id = $1',
    [roomId],
  );
  const players: Player[] = playerRows.map((row: any) => ({
    id:          row.id,
    name:        row.name,
    lives:       row.lives,
    hand:        JSON.parse(row.hand),
    connected:   row.connected,
    isEliminated: row.is_eliminated,
    isSpectator: row.is_spectator,
    sessionId:   row.session_id,
    wasKicked:   row.was_kicked,
  }));

  const { rows: chatRows } = await pool.query(
    'SELECT * FROM room_chat WHERE room_id = $1 ORDER BY timestamp DESC LIMIT 30',
    [roomId],
  );
  const chatMessages: ChatMessage[] = chatRows.reverse().map((row: any) => ({
    id:         row.id,
    playerId:   row.player_id,
    playerName: row.player_name,
    text:       row.text,
    timestamp:  Number(row.timestamp),
  }));

  console.log(`[LoadRoom] Sala ${roomId} carregada do banco — chatMessages: ${chatMessages.length}`);

  return {
    roomId:         room.id,
    hostId:         room.host_id,
    hostName:       room.host_name,
    phase:          room.phase,
    round:          room.round,
    cardsThisRound: room.cards_this_round,
    ascending:      room.ascending,
    players,
    currentTurn:    room.current_turn ?? '',
    bettingOrder:   [],
    bets:           {},
    tricksTaken:    {},
    currentTrick:   [],
    trickLeader:    room.trick_leader ?? room.host_id,
    trickNumber:    room.trick_number,
    dealerIndex:    room.dealer_index,
    resolvingTrick: room.resolving_trick,
    config,
    trickState:     null,
    activeVoteKick: null,
    bannedIds:      await getBannedPlayers(roomId),
    chatMessages,
    spectatorQueue: [],
  };
}

export async function deleteRoom(roomId: string): Promise<void> {
  await pool.query('DELETE FROM rooms WHERE id = $1', [roomId]);
}

// ─── Room listings ────────────────────────────────────────────────────────────

async function getPlayerCount(roomId: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM players WHERE room_id = $1',
    [roomId],
  );
  return parseInt(rows[0].count, 10);
}

export async function listPublicRooms(): Promise<Array<{
  roomId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  config: GameConfig;
}>> {
  const { rows } = await pool.query(`
    SELECT r.*, c.*
    FROM rooms r
    LEFT JOIN room_configs c ON r.id = c.room_id
    WHERE r.phase = 'lobby' AND r.is_public = TRUE
    ORDER BY r.created_at DESC
  `);

  const result = await Promise.all(
    rows.map(async (row: any) => ({
      roomId:      row.id,
      hostName:    row.host_name,
      playerCount: await getPlayerCount(row.id),
      maxPlayers:  row.max_players ?? 14,
      config: {
        livesPerPlayer:     row.lives_per_player      ?? 3,
        fdpRule:            row.fdp_rule              ?? false,
        fdpStartDoubleDeck: row.fdp_start_double_deck ?? false,
        cardOnForeheadRule: row.card_on_forehead_rule  ?? true,
        suitTiebreakerRule: row.suit_tiebreaker_rule   ?? false,
        maxRounds:          row.max_rounds             ?? 0,
        isPublic:           true,
        deckCount:          row.deck_count             ?? 1,
        maxPlayers:         row.max_players            ?? 14,
        forceTwoDecks:      row.force_two_decks        ?? false,
        insanityMode:       row.insanity_mode          ?? false,
      } as GameConfig,
    })),
  );

  return result.filter((r: any) => r.playerCount > 0);
}

export async function listWatchableRoomsDB(): Promise<Array<{
  roomId: string;
  hostName: string;
  phase: string;
  playerCount: number;
  maxPlayers: number;
  config: GameConfig;
}>> {
  const { rows } = await pool.query(`
    SELECT r.*, c.*
    FROM rooms r
    LEFT JOIN room_configs c ON r.id = c.room_id
    WHERE r.phase NOT IN ('lobby','game_over') AND r.is_public = TRUE
    ORDER BY r.last_activity DESC
  `);

  const result = await Promise.all(
    rows.map(async (row: any) => ({
      roomId:      row.id,
      hostName:    row.host_name,
      phase:       row.phase,
      playerCount: await getPlayerCount(row.id),
      maxPlayers:  row.max_players ?? 14,
      config: {
        livesPerPlayer:     row.lives_per_player      ?? 3,
        fdpRule:            row.fdp_rule              ?? false,
        fdpStartDoubleDeck: row.fdp_start_double_deck ?? false,
        cardOnForeheadRule: row.card_on_forehead_rule  ?? true,
        suitTiebreakerRule: row.suit_tiebreaker_rule   ?? false,
        maxRounds:          row.max_rounds             ?? 0,
        isPublic:           true,
        deckCount:          row.deck_count             ?? 1,
        maxPlayers:         row.max_players            ?? 14,
        forceTwoDecks:      row.force_two_decks        ?? false,
        insanityMode:       row.insanity_mode          ?? false,
      } as GameConfig,
    })),
  );

  return result.filter((r: any) => r.playerCount > 0);
}

// ─── Bans ─────────────────────────────────────────────────────────────────────

export async function banPlayer(
  roomId: string,
  sessionId: string,
  bannedBy: string,
  reason?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO banned_players (room_id, session_id, banned_by, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (room_id, session_id) DO NOTHING`,
    [roomId, sessionId, bannedBy, reason ?? null],
  );
}

export async function isPlayerBanned(roomId: string, sessionId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM banned_players WHERE room_id = $1 AND session_id = $2 LIMIT 1',
    [roomId, sessionId],
  );
  return rows.length > 0;
}

export async function getBannedPlayers(roomId: string): Promise<string[]> {
  const { rows } = await pool.query(
    'SELECT session_id FROM banned_players WHERE room_id = $1',
    [roomId],
  );
  return rows.map((row: any) => row.session_id);
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export async function addRoomChatMessage(
  roomId: string,
  playerId: string,
  playerName: string,
  text: string,
): Promise<ChatMessage> {
  const message: ChatMessage = {
    id:         crypto.randomUUID(),
    roomId,
    playerId,
    playerName,
    text,
    timestamp:  Date.now(),
  };

  await pool.query(
    `INSERT INTO room_chat (id, room_id, player_id, player_name, text, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [message.id, roomId, playerId, playerName, text, message.timestamp],
  );

  console.log(`[DB] Mensagem salva — Sala: ${roomId}, texto: ${text.substring(0, 30)}`);
  return message;
}

// ─── Reactions ───────────────────────────────────────────────────────────────

export async function addRoomReaction(
  roomId: string,
  playerId: string,
  emoji: string,
): Promise<void> {
  await pool.query(
    'INSERT INTO room_reactions (room_id, player_id, emoji) VALUES ($1, $2, $3)',
    [roomId, playerId, emoji],
  );
}

export async function getRoomReactions(roomId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM room_reactions
     WHERE room_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [roomId],
  );
  return rows;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

export async function checkRateLimit(
  playerId: string,
  roomId: string | undefined,
  action: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;

  await pool.query(
    'DELETE FROM rate_limits WHERE window_start < $1',
    [windowStart],
  );

  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM rate_limits
     WHERE player_id = $1 AND action = $2 AND window_start > $3`,
    [playerId, action, windowStart],
  );

  if (parseInt(rows[0].count, 10) >= maxRequests) return false;

  await pool.query(
    `INSERT INTO rate_limits (player_id, room_id, action, count, window_start)
     VALUES ($1, $2, $3, 1, $4)`,
    [playerId, roomId ?? null, action, now],
  );

  return true;
}

// ─── Activity & cleanup ──────────────────────────────────────────────────────

export async function updateRoomActivity(roomId: string): Promise<void> {
  await pool.query(
    'UPDATE rooms SET last_activity = $1 WHERE id = $2',
    [Math.floor(Date.now() / 1000), roomId],
  );
}

export async function loadRoomLastActivity(roomId: string): Promise<number | null> {
  const { rows } = await pool.query(
    'SELECT last_activity FROM rooms WHERE id = $1',
    [roomId],
  );
  return rows[0]?.last_activity ? Number(rows[0].last_activity) : null;
}

export async function cleanupInactiveRooms(): Promise<string[]> {
  const now      = Math.floor(Date.now() / 1000);
  const oneHour  = now - 3600;
  const fifteenM = now - 900;
  const fiveM    = now - 300;

  const results = await Promise.all([
    // Empty lobbies older than 5 min
    pool.query<{ id: string }>(
      `DELETE FROM rooms
       WHERE phase = 'lobby' AND last_activity < $1
         AND id NOT IN (SELECT DISTINCT room_id FROM players WHERE room_id IS NOT NULL)
       RETURNING id`,
      [fiveM],
    ),
    // Single-player lobbies older than 15 min
    pool.query<{ id: string }>(
      `DELETE FROM rooms
       WHERE phase = 'lobby' AND last_activity < $1
         AND id IN (
           SELECT room_id FROM players WHERE room_id IS NOT NULL
           GROUP BY room_id HAVING COUNT(*) = 1
         )
       RETURNING id`,
      [fifteenM],
    ),
    // Multi-player lobbies older than 1 h
    pool.query<{ id: string }>(
      `DELETE FROM rooms
       WHERE phase = 'lobby' AND last_activity < $1
         AND id IN (
           SELECT room_id FROM players WHERE room_id IS NOT NULL
           GROUP BY room_id HAVING COUNT(*) > 1
         )
       RETURNING id`,
      [oneHour],
    ),
    // Game-over rooms older than 5 min
    pool.query<{ id: string }>(
      `DELETE FROM rooms WHERE phase = 'game_over' AND last_activity < $1 RETURNING id`,
      [fiveM],
    ),
    // Active-phase rooms with no connected players, inactive 15 min
    pool.query<{ id: string }>(
      `DELETE FROM rooms
       WHERE phase IN ('betting','playing','round_end') AND last_activity < $1
         AND id NOT IN (
           SELECT DISTINCT room_id FROM players
           WHERE room_id IS NOT NULL AND connected = TRUE
         )
       RETURNING id`,
      [fifteenM],
    ),
  ]);

  const deletedIds = results.flatMap((r: any) => r.rows.map((row: any) => row.id));
  if (deletedIds.length > 0) {
    console.log(`🧹 ${deletedIds.length} salas inativas removidas`);
  }
  return deletedIds;
}

