import crypto from "node:crypto";
import { createPool, Pool } from "mysql2/promise";
import path from "node:path";
import fs from "node:fs";

// sqlite3 types may not be installed in all environments; declare module to allow optional import
declare module 'sqlite3';

export type Db = {
  prepare: (sql: string) => {
    all: (...params: any[]) => Promise<any[]>;
    get: (...params: any[]) => Promise<any | undefined>;
    run: (...params: any[]) => Promise<{ changes?: number; lastInsertId?: number }>;
  };
  exec: (sql: string) => Promise<void>;
  close?: () => Promise<void>;
};

function isUsingMySql() {
  return Boolean(process.env.USE_MYSQL === "1" || process.env.MYSQL_HOST || process.env.MYSQL_URL);
}

export async function openDb(): Promise<Db> {
  const dbType = (process.env.DB_TYPE ?? (isUsingMySql() ? 'mysql' : 'sqlite')).toLowerCase();

  if (dbType === 'sqlite') {
    // Try better-sqlite3 first (fast sync API). If not present, try the node sqlite3 driver.
    const sqlitePath = process.env.SQLITE_DB_PATH ?? path.join(process.cwd(), 'data.db');
    try {
      const Better = await import('better-sqlite3');
      const db = new Better.default(sqlitePath);
      db.pragma('journal_mode = WAL');
      await migrateSqlite(db);
      return {
        prepare(sql: string) {
          return {
            all: async (...params: any[]) => db.prepare(sql).all(...params),
            get: async (...params: any[]) => db.prepare(sql).get(...params),
            run: async (...params: any[]) => {
              const r = db.prepare(sql).run(...params);
              return { changes: r.changes };
            }
          };
        },
        exec: async (sql: string) => { db.exec(sql); return; },
        close: async () => { db.close(); return; }
      };
    } catch (e) {
      // fallback to sqlite3 (async driver)
      try {
        const sqlite3mod = await import('sqlite3');
        const sqlite3 = sqlite3mod.verbose ? sqlite3mod.verbose() : sqlite3mod;
        const sqliteDb = new sqlite3.Database(sqlitePath);

        // Promise wrappers
        function allAsync(sql: string, params: any[] = []) {
          return new Promise<any[]>((resolve, reject) => {
            sqliteDb.all(sql, params, (err: any, rows: any[]) => err ? reject(err) : resolve(rows));
          });
        }
        function getAsync(sql: string, params: any[] = []) {
          return new Promise<any | undefined>((resolve, reject) => {
            sqliteDb.get(sql, params, (err: any, row: any) => err ? reject(err) : resolve(row));
          });
        }
        function runAsync(sql: string, params: any[] = []) {
          return new Promise<{ changes: number }>((resolve, reject) => {
            // use function to access `this` which is the Statement
            sqliteDb.run(sql, params, function (this: any, err: any) {
              if (err) return reject(err);
              resolve({ changes: this?.changes ?? 0 });
            });
          });
        }
        function execAsync(sql: string) {
          return new Promise<void>((resolve, reject) => {
            sqliteDb.exec(sql, (err: any) => err ? reject(err) : resolve());
          });
        }
        async function migrateSqlite3() {
          await execAsync(`
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT NOT NULL UNIQUE,
              passwordHash TEXT NOT NULL,
              createdAt INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS projects (
              projectKey TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              createdAt INTEGER NOT NULL,
              ingestKey TEXT
            );

            CREATE TABLE IF NOT EXISTS issues (
              id TEXT PRIMARY KEY,
              projectKey TEXT NOT NULL,
              title TEXT NOT NULL,
              count INTEGER NOT NULL,
              firstSeen INTEGER NOT NULL,
              lastSeen INTEGER NOT NULL,
              fingerprint TEXT,
              resolvedAt INTEGER,
              previousIssueId TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_issues_project_lastSeen ON issues(projectKey, lastSeen DESC);
            CREATE TABLE IF NOT EXISTS events (
              id TEXT PRIMARY KEY,
              issueId TEXT NOT NULL,
              projectKey TEXT NOT NULL,
              occurredAt INTEGER NOT NULL,
              payloadJson TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_events_issue_occurredAt ON events(issueId, occurredAt DESC);

            CREATE TABLE IF NOT EXISTS sourcemaps (
              id TEXT PRIMARY KEY,
              projectKey TEXT NOT NULL,
              fileName TEXT NOT NULL,
              content TEXT NOT NULL,
              uploadedAt INTEGER NOT NULL
            );
          `);

          // now run migrations similar to the better-sqlite3 path
          const cols = await allAsync("PRAGMA table_info('projects')");
          const hasIngestKey = Array.isArray(cols) && cols.some((c: any) => c.name === 'ingestKey');
          if (!hasIngestKey) await execAsync("ALTER TABLE projects ADD COLUMN ingestKey TEXT");

          const issueColsPost = await allAsync("PRAGMA table_info('issues')");
          const hasFingerprintPost = Array.isArray(issueColsPost) && issueColsPost.some((c: any) => c.name === 'fingerprint');
          if (hasFingerprintPost) {
            try { await execAsync("CREATE INDEX IF NOT EXISTS idx_issues_fingerprint_project ON issues(fingerprint, projectKey)"); } catch (e) { /* ignore */ }
          }

          const missing = await allAsync("SELECT projectKey FROM projects WHERE ingestKey IS NULL OR ingestKey = ''");
          if (Array.isArray(missing) && missing.length) {
            for (const row of missing) {
              await runAsync("UPDATE projects SET ingestKey = ? WHERE projectKey = ?", [crypto.randomBytes(24).toString('hex'), row.projectKey]);
            }
          }

          const issueCols = await allAsync("PRAGMA table_info('issues')");
          const hasFingerprint = Array.isArray(issueCols) && issueCols.some((c: any) => c.name === 'fingerprint');
          if (!hasFingerprint) {
            await execAsync("ALTER TABLE issues ADD COLUMN fingerprint TEXT");
            const rows = await allAsync("SELECT id FROM issues");
            for (const r of rows) {
              await runAsync("UPDATE issues SET fingerprint = ? WHERE id = ?", [r.id, r.id]);
            }
          }

          const hasResolvedAt = Array.isArray(issueCols) && issueCols.some((c: any) => c.name === 'resolvedAt');
          if (!hasResolvedAt) await execAsync("ALTER TABLE issues ADD COLUMN resolvedAt INTEGER");

          const hasPrev = Array.isArray(issueCols) && issueCols.some((c: any) => c.name === 'previousIssueId');
          if (!hasPrev) await execAsync("ALTER TABLE issues ADD COLUMN previousIssueId TEXT");
        }

        await migrateSqlite3();

        return {
          prepare(sql: string) {
            return {
              all: async (...params: any[]) => allAsync(sql, params),
              get: async (...params: any[]) => getAsync(sql, params),
              run: async (...params: any[]) => runAsync(sql, params)
            };
          },
          exec: async (sql: string) => execAsync(sql),
          close: async () => new Promise((resolve: any, reject: any) => sqliteDb.close((err: any) => err ? reject(err) : resolve()))
        };
      } catch (e2) {
        throw new Error("No SQLite driver found. Install either 'better-sqlite3' or 'sqlite3' in the server package (npm i --workspace packages/server better-sqlite3 OR sqlite3).");
      }
    }
  }

  // MySQL path
  const host = process.env.MYSQL_HOST ?? "127.0.0.1";
  const port = Number(process.env.MYSQL_PORT ?? 3306);
  const user = process.env.MYSQL_USER ?? "stacktrail";
  const password = process.env.MYSQL_PASSWORD ?? "stacktrail";
  const database = process.env.MYSQL_DATABASE ?? "stacktrail";

  const pool = createPool({ host, port, user, password, database, waitForConnections: true, connectionLimit: 10 });

  await migrateMySql(pool);

  return {
    prepare(sql: string) {
      return {
        all: async (...params: any[]) => {
          const [rows] = await pool.execute(sql, params);
          return rows as any[];
        },
        get: async (...params: any[]) => {
          const [rows] = await pool.execute(sql, params);
          return (rows as any[])[0];
        },
        run: async (...params: any[]) => {
          const [res]: any = await pool.execute(sql, params);
          return { changes: res.affectedRows ?? 0, lastInsertId: res.insertId ?? undefined };
        }
      };
    },
    exec: async (sql: string) => {
      await pool.query(sql);
    },
    close: async () => pool.end()
  };
}

async function migrateSqlite(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      projectKey TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      ingestKey TEXT
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      projectKey TEXT NOT NULL,
      title TEXT NOT NULL,
      count INTEGER NOT NULL,
      firstSeen INTEGER NOT NULL,
      lastSeen INTEGER NOT NULL,
      fingerprint TEXT,
      resolvedAt INTEGER,
      previousIssueId TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_issues_project_lastSeen ON issues(projectKey, lastSeen DESC);
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      issueId TEXT NOT NULL,
      projectKey TEXT NOT NULL,
      occurredAt INTEGER NOT NULL,
      payloadJson TEXT NOT NULL,
      FOREIGN KEY(issueId) REFERENCES issues(id)
    );

    CREATE INDEX IF NOT EXISTS idx_events_issue_occurredAt ON events(issueId, occurredAt DESC);

    CREATE TABLE IF NOT EXISTS sourcemaps (
      id TEXT PRIMARY KEY,
      projectKey TEXT NOT NULL,
      fileName TEXT NOT NULL,
      content TEXT NOT NULL,
      uploadedAt INTEGER NOT NULL
    );
  `);

  // If projects table existed before ingestKey was added, backfill it.
  const cols = db.prepare("SELECT name FROM pragma_table_info('projects')").all() as Array<{ name: string }>;
  const hasIngestKey = cols.some((c) => c.name === "ingestKey");
  if (!hasIngestKey) {
    db.exec("ALTER TABLE projects ADD COLUMN ingestKey TEXT");
  }

  // Create fingerprint index if the column exists
  const issueColsPost = db.prepare("SELECT name FROM pragma_table_info('issues')").all() as Array<{ name: string }>;
  const hasFingerprintPost = issueColsPost.some((c) => c.name === "fingerprint");
  if (hasFingerprintPost) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_issues_fingerprint_project ON issues(fingerprint, projectKey)");
  }

  const missing = db.prepare("SELECT projectKey FROM projects WHERE ingestKey IS NULL OR ingestKey = ''").all() as Array<{ projectKey: string }>;
  if (missing.length) {
    const update = db.prepare("UPDATE projects SET ingestKey = ? WHERE projectKey = ?");
    const tx = db.transaction(() => {
      for (const row of missing) {
        update.run(crypto.randomBytes(24).toString("hex"), row.projectKey);
      }
    });
    tx();
  }

  // If issues table existed before fingerprint/resolvedAt/previousIssueId were added, backfill it.
  const issueCols = db.prepare("SELECT name FROM pragma_table_info('issues')").all() as Array<{ name: string }>;
  const hasFingerprint = issueCols.some((c) => c.name === "fingerprint");
  if (!hasFingerprint) {
    db.exec("ALTER TABLE issues ADD COLUMN fingerprint TEXT");
    // For existing rows where id was the fingerprint (legacy), copy id to fingerprint
    const rows = db.prepare("SELECT id FROM issues").all() as Array<{ id: string }>;
    const update = db.prepare("UPDATE issues SET fingerprint = ? WHERE id = ?");
    const tx = db.transaction(() => {
      for (const r of rows) update.run(r.id, r.id);
    });
    tx();
  }

  const hasResolvedAt = issueCols.some((c) => c.name === "resolvedAt");
  if (!hasResolvedAt) db.exec("ALTER TABLE issues ADD COLUMN resolvedAt INTEGER");

  const hasPrev = issueCols.some((c) => c.name === "previousIssueId");
  if (!hasPrev) db.exec("ALTER TABLE issues ADD COLUMN previousIssueId TEXT");
}

async function migrateMySql(pool: Pool) {
  // create tables if not exists using MySQL syntax
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(200) NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      createdAt BIGINT NOT NULL
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      projectKey VARCHAR(200) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      createdAt BIGINT NOT NULL,
      ingestKey VARCHAR(128)
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS issues (
      id VARCHAR(36) PRIMARY KEY,
      projectKey VARCHAR(200) NOT NULL,
      title TEXT NOT NULL,
      count INT NOT NULL,
      firstSeen BIGINT NOT NULL,
      lastSeen BIGINT NOT NULL,
      fingerprint VARCHAR(128),
      resolvedAt BIGINT,
      previousIssueId VARCHAR(36)
    ) ENGINE=InnoDB;
  `);

  try {
    await pool.query(`CREATE INDEX idx_issues_project_lastSeen ON issues (projectKey, lastSeen)`);
  } catch (e) { /* ignore */ }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id VARCHAR(36) PRIMARY KEY,
      issueId VARCHAR(36) NOT NULL,
      projectKey VARCHAR(200) NOT NULL,
      occurredAt BIGINT NOT NULL,
      payloadJson TEXT NOT NULL
    ) ENGINE=InnoDB;
  `);

  try {
    await pool.query(`CREATE INDEX idx_events_issue_occurredAt ON events (issueId, occurredAt)`);
  } catch (e) { /* ignore */ }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sourcemaps (
      id VARCHAR(36) PRIMARY KEY,
      projectKey VARCHAR(200) NOT NULL,
      fileName VARCHAR(260) NOT NULL,
      content LONGTEXT NOT NULL,
      uploadedAt BIGINT NOT NULL
    ) ENGINE=InnoDB;
  `);

  // Backfill ingest keys if missing
  const [rows] = await pool.query(`SELECT projectKey FROM projects WHERE ingestKey IS NULL OR ingestKey = ''`);
  if (Array.isArray(rows) && rows.length) {
    for (const r of rows as any[]) {
      const key = crypto.randomBytes(24).toString("hex");
      await pool.query(`UPDATE projects SET ingestKey = ? WHERE projectKey = ?`, [key, r.projectKey]);
    }
  }
}
