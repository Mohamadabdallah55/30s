import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function createDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? path.resolve(process.cwd(), 'data', 't30_mosque.db');
  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const ageCheck = `CHECK(age_group IN ('kids_7_10','preteen_11_13','teen_14_17','adults_18_plus','family','kids','youth','adults'))`;

  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','teacher','player','guest')),
      age_group TEXT NOT NULL ${ageCheck},
      avatar_id TEXT NOT NULL DEFAULT 'crescent',
      total_questions_seen INTEGER NOT NULL DEFAULT 0,
      total_correct INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      achievements_json TEXT NOT NULL DEFAULT '[]',
      categories_played_json TEXT NOT NULL DEFAULT '{}',
      difficulties_played_json TEXT NOT NULL DEFAULT '{"easy":0,"medium":0,"hard":0}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'التربية الإسلامية',
      age_group TEXT NOT NULL ${ageCheck},
      difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
      created_by TEXT NOT NULL REFERENCES profiles(id),
      status TEXT NOT NULL DEFAULT 'active',
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lesson_documents (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 1,
      is_scanned INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL,
      storage_path TEXT,
      parsed_summary_json TEXT NOT NULL DEFAULT '{}',
      analysis_json TEXT NOT NULL DEFAULT '{}',
      objectives_json TEXT NOT NULL DEFAULT '[]',
      extracted_content_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pdf_analysis_cache (
      sha256 TEXT PRIMARY KEY,
      page_count INTEGER NOT NULL DEFAULT 1,
      is_scanned INTEGER NOT NULL DEFAULT 0,
      is_religious INTEGER NOT NULL DEFAULT 0,
      page_texts_json TEXT NOT NULL DEFAULT '[]',
      analysis_json TEXT NOT NULL,
      model_used TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS question_banks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'عام',
      source_type TEXT NOT NULL CHECK(source_type IN ('general','lesson','imported')),
      lesson_id TEXT REFERENCES lessons(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
      external_id TEXT,
      round_type TEXT NOT NULL,
      category TEXT NOT NULL,
      age_group TEXT NOT NULL ${ageCheck},
      difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
      difficulty_level INTEGER NOT NULL DEFAULT 3,
      unsuitable_for_timed INTEGER NOT NULL DEFAULT 0,
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL DEFAULT '[]',
      acceptable_answers_json TEXT NOT NULL DEFAULT '[]',
      correct_index INTEGER,
      explanation TEXT DEFAULT '',
      clues_json TEXT NOT NULL DEFAULT '[]',
      order_criteria TEXT DEFAULT '',
      memory_items_json TEXT NOT NULL DEFAULT '[]',
      memory_reveal_seconds INTEGER DEFAULT 8,
      odd_reason TEXT DEFAULT '',
      is_religious INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','needs_review','archived','rejected')),
      source_page INTEGER,
      source_excerpt TEXT,
      confidence_score REAL,
      normalized_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_questions_bank_status ON questions(bank_id, status, round_type, age_group, difficulty);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_bank_ext_id ON questions(bank_id, external_id) WHERE external_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_questions_hash ON questions(bank_id, normalized_hash);

    CREATE TABLE IF NOT EXISTS question_exposures (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
      session_id TEXT,
      exposed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(profile_id, question_id, bank_id)
    );

    CREATE INDEX IF NOT EXISTS idx_exposures_lookup ON question_exposures(profile_id, bank_id, question_id);

    CREATE TABLE IF NOT EXISTS game_sessions (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      host_profile_id TEXT REFERENCES profiles(id),
      bank_id TEXT NOT NULL REFERENCES question_banks(id),
      lesson_id TEXT REFERENCES lessons(id),
      title TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'lobby',
      state_json TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
      profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      team_index INTEGER NOT NULL DEFAULT 0,
      nickname TEXT NOT NULL,
      joined_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      round_type TEXT NOT NULL,
      title TEXT NOT NULL,
      config_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS answers (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
      round_id TEXT REFERENCES rounds(id) ON DELETE SET NULL,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      team_index INTEGER NOT NULL,
      profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      submitted_answer TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      points_delta INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
      team_index INTEGER NOT NULL,
      team_name TEXT NOT NULL,
      team_color TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      strikes INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, team_index)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lesson_question_batches (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
      pipeline_stage TEXT NOT NULL,
      stage_logs_json TEXT NOT NULL DEFAULT '[]',
      requested_count INTEGER NOT NULL DEFAULT 10,
      received_count INTEGER NOT NULL DEFAULT 0,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      generated_count INTEGER NOT NULL DEFAULT 0,
      verified_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      plan_json TEXT NOT NULL DEFAULT '[]',
      completed_batches INTEGER NOT NULL DEFAULT 0,
      failed_batches INTEGER NOT NULL DEFAULT 0,
      total_batches INTEGER NOT NULL DEFAULT 0,
      current_batch_size INTEGER NOT NULL DEFAULT 8,
      failed_batch_index INTEGER,
      last_batch_status TEXT NOT NULL DEFAULT 'idle',
      error_category TEXT,
      model_used TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      started_at TEXT,
      ended_at TEXT,
      status_message_ar TEXT DEFAULT '',
      diagnostic_logs_json TEXT NOT NULL DEFAULT '[]',
      insufficient_content_note TEXT DEFAULT '',
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS question_reviews (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      reviewer_profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      action TEXT NOT NULL CHECK(action IN ('approve','reject','edit','flag_objection')),
      notes TEXT DEFAULT '',
      previous_status TEXT,
      new_status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safe idempotent migrations for existing SQLite database files
  const ensureColumn = (table: string, column: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  ensureColumn('lesson_documents', 'extracted_content_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('questions', 'difficulty_level', 'INTEGER NOT NULL DEFAULT 3');
  ensureColumn('questions', 'unsuitable_for_timed', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('lesson_question_batches', 'plan_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('lesson_question_batches', 'received_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('lesson_question_batches', 'accepted_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('lesson_question_batches', 'completed_batches', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('lesson_question_batches', 'failed_batches', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('lesson_question_batches', 'total_batches', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('lesson_question_batches', 'current_batch_size', 'INTEGER NOT NULL DEFAULT 8');
  ensureColumn('lesson_question_batches', 'failed_batch_index', 'INTEGER');
  ensureColumn('lesson_question_batches', 'last_batch_status', "TEXT NOT NULL DEFAULT 'idle'");
  ensureColumn('lesson_question_batches', 'error_category', 'TEXT');
  ensureColumn('lesson_question_batches', 'model_used', "TEXT NOT NULL DEFAULT 'gemini-4-hydrogen'");
  ensureColumn('lesson_question_batches', 'started_at', 'TEXT');
  ensureColumn('lesson_question_batches', 'ended_at', 'TEXT');
  ensureColumn('lesson_question_batches', 'status_message_ar', "TEXT DEFAULT ''");
  ensureColumn('lesson_question_batches', 'diagnostic_logs_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('lesson_question_batches', 'insufficient_content_note', "TEXT DEFAULT ''");
  ensureColumn('lesson_question_batches', 'cancel_requested', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('pdf_analysis_cache', 'is_religious', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('pdf_analysis_cache', 'updated_at', "TEXT NOT NULL DEFAULT ''");

  // Migrate old 4-tier age_group CHECK constraints cleanly on pre-existing DBs
  const needsAgeConstraintMigration = (tableName: string): boolean => {
    const row = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
      .get(tableName) as { sql?: string } | undefined;
    return Boolean(row?.sql && !row.sql.includes('kids_7_10'));
  };

  if (
    needsAgeConstraintMigration('profiles') ||
    needsAgeConstraintMigration('lessons') ||
    needsAgeConstraintMigration('questions')
  ) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      if (needsAgeConstraintMigration('profiles')) {
        db.exec(`
          CREATE TABLE profiles_new (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            email TEXT,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','teacher','player','guest')),
            age_group TEXT NOT NULL ${ageCheck},
            avatar_id TEXT NOT NULL DEFAULT 'crescent',
            total_questions_seen INTEGER NOT NULL DEFAULT 0,
            total_correct INTEGER NOT NULL DEFAULT 0,
            xp INTEGER NOT NULL DEFAULT 0,
            achievements_json TEXT NOT NULL DEFAULT '[]',
            categories_played_json TEXT NOT NULL DEFAULT '{}',
            difficulties_played_json TEXT NOT NULL DEFAULT '{"easy":0,"medium":0,"hard":0}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          INSERT INTO profiles_new SELECT * FROM profiles;
          DROP TABLE profiles;
          ALTER TABLE profiles_new RENAME TO profiles;
        `);
      }
      if (needsAgeConstraintMigration('lessons')) {
        db.exec(`
          CREATE TABLE lessons_new (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            subject TEXT NOT NULL DEFAULT 'التربية الإسلامية',
            age_group TEXT NOT NULL ${ageCheck},
            difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
            created_by TEXT NOT NULL REFERENCES profiles(id),
            status TEXT NOT NULL DEFAULT 'active',
            deleted_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          INSERT INTO lessons_new SELECT * FROM lessons;
          DROP TABLE lessons;
          ALTER TABLE lessons_new RENAME TO lessons;
        `);
      }
      if (needsAgeConstraintMigration('questions')) {
        db.exec(`
          CREATE TABLE questions_new (
            id TEXT PRIMARY KEY,
            bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
            external_id TEXT,
            round_type TEXT NOT NULL,
            category TEXT NOT NULL,
            age_group TEXT NOT NULL ${ageCheck},
            difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
            difficulty_level INTEGER NOT NULL DEFAULT 3,
            unsuitable_for_timed INTEGER NOT NULL DEFAULT 0,
            prompt TEXT NOT NULL,
            options_json TEXT NOT NULL DEFAULT '[]',
            acceptable_answers_json TEXT NOT NULL DEFAULT '[]',
            correct_index INTEGER,
            explanation TEXT DEFAULT '',
            clues_json TEXT NOT NULL DEFAULT '[]',
            order_criteria TEXT DEFAULT '',
            memory_items_json TEXT NOT NULL DEFAULT '[]',
            memory_reveal_seconds INTEGER DEFAULT 8,
            odd_reason TEXT DEFAULT '',
            is_religious INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','needs_review','archived','rejected')),
            source_page INTEGER,
            source_excerpt TEXT,
            confidence_score REAL,
            normalized_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          INSERT INTO questions_new (
            id, bank_id, external_id, round_type, category, age_group, difficulty,
            difficulty_level, unsuitable_for_timed,
            prompt, options_json, acceptable_answers_json, correct_index, explanation,
            clues_json, order_criteria, memory_items_json, memory_reveal_seconds,
            odd_reason, is_religious, status, source_page, source_excerpt,
            confidence_score, normalized_hash, created_at
          ) SELECT
            id, bank_id, external_id, round_type, category, age_group, difficulty,
            COALESCE(difficulty_level, CASE difficulty WHEN 'easy' THEN 2 WHEN 'hard' THEN 5 ELSE 3 END),
            COALESCE(unsuitable_for_timed, 0),
            prompt, options_json, acceptable_answers_json, correct_index, explanation,
            clues_json, order_criteria, memory_items_json, memory_reveal_seconds,
            odd_reason, is_religious, status, source_page, source_excerpt,
            confidence_score, normalized_hash, created_at
          FROM questions;
          DROP TABLE questions;
          ALTER TABLE questions_new RENAME TO questions;
          CREATE INDEX IF NOT EXISTS idx_questions_bank_status ON questions(bank_id, status, round_type, age_group, difficulty);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_bank_ext_id ON questions(bank_id, external_id) WHERE external_id IS NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_questions_hash ON questions(bank_id, normalized_hash);
        `);
      }
    })();
    db.pragma('foreign_keys = ON');
  }

  ensureColumn('questions', 'required_count', 'INTEGER');
  ensureColumn('questions', 'age_bands_json', 'TEXT');
  ensureColumn('questions', 'concept_id', 'TEXT');
  ensureColumn('questions', 'memory_require_order', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('questions', 'bid_minimum', 'INTEGER');
  ensureColumn('questions', 'bid_maximum', 'INTEGER');
  ensureColumn('questions', 'accepts_other_answers', 'INTEGER');
  return db;
}

let singletonDb: Database.Database | null = null;
export function getDb(): Database.Database {
  if (!singletonDb) {
    singletonDb = createDatabase();
  }
  return singletonDb;
}
