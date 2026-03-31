import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../../data/fodinha.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables
export function initializeDatabase() {
  // Rooms table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL,
      host_name TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'lobby',
      round INTEGER NOT NULL DEFAULT 1,
      cards_this_round INTEGER NOT NULL DEFAULT 1,
      ascending INTEGER NOT NULL DEFAULT 1,
      current_turn TEXT,
      trick_leader TEXT,
      trick_number INTEGER NOT NULL DEFAULT 1,
      dealer_index INTEGER NOT NULL DEFAULT 0,
      resolving_trick INTEGER NOT NULL DEFAULT 0,
      is_public INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      last_activity INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Players table
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      name TEXT NOT NULL,
      lives INTEGER NOT NULL DEFAULT 3,
      hand TEXT NOT NULL DEFAULT '[]',
      connected INTEGER NOT NULL DEFAULT 1,
      is_eliminated INTEGER NOT NULL DEFAULT 0,
      session_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  // Room config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_configs (
      room_id TEXT PRIMARY KEY,
      lives_per_player INTEGER NOT NULL DEFAULT 3,
      fdp_rule INTEGER NOT NULL DEFAULT 0,
      card_on_forehead_rule INTEGER NOT NULL DEFAULT 1,
      suit_tiebreaker_rule INTEGER NOT NULL DEFAULT 0,
      max_rounds INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  // Banned players table (persistent across sessions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS banned_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      banned_by TEXT NOT NULL,
      reason TEXT,
      banned_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      UNIQUE(room_id, session_id)
    )
  `);

  // Global chat messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS global_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Room chat messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_chat (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  // Room reactions table (emoji reactions like Meet)
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  // Rate limiting table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      player_id TEXT NOT NULL,
      room_id TEXT,
      action TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      window_start INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (player_id, action, window_start)
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
    CREATE INDEX IF NOT EXISTS idx_banned_players_room ON banned_players(room_id);
    CREATE INDEX IF NOT EXISTS idx_global_chat_created ON global_chat(created_at);
    CREATE INDEX IF NOT EXISTS idx_room_chat_room ON room_chat(room_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_room_reactions_room ON room_reactions(room_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON rooms(last_activity);
    CREATE INDEX IF NOT EXISTS idx_rate_limits_player ON rate_limits(player_id, action, window_start);
  `);

  // Clean up old data periodically
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS cleanup_global_chat
    AFTER INSERT ON global_chat
    WHEN (SELECT COUNT(*) FROM global_chat) > 500
    BEGIN
      DELETE FROM global_chat WHERE id IN (
        SELECT id FROM global_chat ORDER BY created_at ASC LIMIT 1
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS cleanup_room_chat
    AFTER INSERT ON room_chat
    WHEN (SELECT COUNT(*) FROM room_chat WHERE room_id = NEW.room_id) > 30
    BEGIN
      DELETE FROM room_chat WHERE id IN (
        SELECT id FROM room_chat
        WHERE room_id = NEW.room_id
        ORDER BY timestamp ASC
        LIMIT 1
      );
    END
  `);
}

// Clean up expired rate limits (run periodically)
export function cleanupExpiredRateLimits() {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    DELETE FROM rate_limits WHERE window_start < ?
  `).run(now - 3600); // Clean up windows older than 1 hour
}

// Clean up old reactions (older than 10 seconds)
export function cleanupOldReactions() {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    DELETE FROM room_reactions WHERE created_at < ?
  `).run(now - 10);
}

// Get global chat messages
export function getGlobalChatMessages(limit: number = 50): any[] {
  const stmt = db.prepare(`
    SELECT * FROM global_chat
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as any[];
  return rows.reverse();
}

// Add global chat message
export function addGlobalChatMessage(
  playerId: string,
  playerName: string,
  text: string
): any {
  const result = db.prepare(`
    INSERT INTO global_chat (player_id, player_name, text)
    VALUES (?, ?, ?)
  `).run(playerId, playerName, text);

  return {
    id: result.lastInsertRowid,
    playerId,
    playerName,
    text,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

export { db };
