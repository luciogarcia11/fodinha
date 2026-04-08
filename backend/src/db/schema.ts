import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://fodinha:fodinha@localhost:5432/fodinha',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err: any) => {
  console.error('[PG] Unexpected error on idle client', err);
});

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        host_name TEXT NOT NULL,
        phase TEXT NOT NULL DEFAULT 'lobby',
        round INTEGER NOT NULL DEFAULT 1,
        cards_this_round INTEGER NOT NULL DEFAULT 1,
        ascending BOOLEAN NOT NULL DEFAULT TRUE,
        current_turn TEXT,
        trick_leader TEXT,
        trick_number INTEGER NOT NULL DEFAULT 1,
        dealer_index INTEGER NOT NULL DEFAULT 0,
        resolving_trick BOOLEAN NOT NULL DEFAULT FALSE,
        is_public BOOLEAN NOT NULL DEFAULT TRUE,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        last_activity BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        name TEXT NOT NULL,
        lives INTEGER NOT NULL DEFAULT 3,
        hand TEXT NOT NULL DEFAULT '[]',
        connected BOOLEAN NOT NULL DEFAULT TRUE,
        is_eliminated BOOLEAN NOT NULL DEFAULT FALSE,
        session_id TEXT NOT NULL,
        joined_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        is_spectator BOOLEAN NOT NULL DEFAULT FALSE,
        was_kicked BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (id, room_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS room_configs (
        room_id TEXT PRIMARY KEY,
        lives_per_player INTEGER NOT NULL DEFAULT 3,
        fdp_rule BOOLEAN NOT NULL DEFAULT FALSE,
        fdp_start_double_deck BOOLEAN NOT NULL DEFAULT FALSE,
        card_on_forehead_rule BOOLEAN NOT NULL DEFAULT TRUE,
        suit_tiebreaker_rule BOOLEAN NOT NULL DEFAULT FALSE,
        max_rounds INTEGER NOT NULL DEFAULT 0,
        deck_count INTEGER NOT NULL DEFAULT 1,
        max_players INTEGER NOT NULL DEFAULT 10,
        force_two_decks BOOLEAN NOT NULL DEFAULT FALSE,
        insanity_mode BOOLEAN NOT NULL DEFAULT FALSE,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS banned_players (
        id SERIAL PRIMARY KEY,
        room_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        banned_by TEXT NOT NULL,
        reason TEXT,
        banned_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        UNIQUE(room_id, session_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS global_chat (
        id SERIAL PRIMARY KEY,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS room_chat (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS room_reactions (
        id SERIAL PRIMARY KEY,
        room_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id SERIAL PRIMARY KEY,
        player_id TEXT NOT NULL,
        room_id TEXT,
        action TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        window_start BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )
    `);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_banned_players_room ON banned_players(room_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_global_chat_created ON global_chat(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_room_chat_room ON room_chat(room_id, timestamp)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_room_reactions_room ON room_reactions(room_id, created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON rooms(last_activity)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rate_limits_player ON rate_limits(player_id, action, window_start)`);

    // Trigger: keep global_chat within 500 rows
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_global_chat_fn() RETURNS TRIGGER AS $$
      DECLARE cnt BIGINT;
      BEGIN
        SELECT COUNT(*) INTO cnt FROM global_chat;
        IF cnt > 500 THEN
          DELETE FROM global_chat
          WHERE id = (SELECT id FROM global_chat ORDER BY created_at ASC LIMIT 1);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`
      DO $$ BEGIN
        EXECUTE 'CREATE TRIGGER cleanup_global_chat AFTER INSERT ON global_chat
          FOR EACH ROW EXECUTE FUNCTION cleanup_global_chat_fn()';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // Trigger: keep room_chat within 30 rows per room
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_room_chat_fn() RETURNS TRIGGER AS $$
      DECLARE cnt BIGINT;
      BEGIN
        SELECT COUNT(*) INTO cnt FROM room_chat WHERE room_id = NEW.room_id;
        IF cnt > 30 THEN
          DELETE FROM room_chat
          WHERE id = (
            SELECT id FROM room_chat
            WHERE room_id = NEW.room_id
            ORDER BY timestamp ASC LIMIT 1
          );
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`
      DO $$ BEGIN
        EXECUTE 'CREATE TRIGGER cleanup_room_chat AFTER INSERT ON room_chat
          FOR EACH ROW EXECUTE FUNCTION cleanup_room_chat_fn()';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await client.query('COMMIT');
    console.log('✅ PostgreSQL schema inicializado');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function cleanupExpiredRateLimits(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await pool.query('DELETE FROM rate_limits WHERE window_start < $1', [now - 3600]);
}

export async function cleanupOldReactions(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await pool.query('DELETE FROM room_reactions WHERE created_at < $1', [now - 10]);
}

export async function getGlobalChatMessages(limit = 50): Promise<any[]> {
  const { rows } = await pool.query(
    'SELECT * FROM global_chat ORDER BY created_at DESC LIMIT $1',
    [limit],
  );
  return rows.reverse();
}

export async function addGlobalChatMessage(
  playerId: string,
  playerName: string,
  text: string,
): Promise<any> {
  const now = Math.floor(Date.now() / 1000);
  const { rows } = await pool.query(
    'INSERT INTO global_chat (player_id, player_name, text, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
    [playerId, playerName, text, now],
  );
  return { id: rows[0].id, playerId, playerName, text, createdAt: now };
}

export { pool };

