import { Glob, type SQL } from "bun";

type MigrationRow = {
  filename: string;
  checksum: string;
};

export type MigrationFile = {
  filename: string;
  path: string;
  contents: string;
  checksum: string;
};

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

const defaultMigrationsDir = new URL("../db/migrations", import.meta.url).pathname;

export function sortSqlFilenames(filenames: string[]) {
  return filenames
    .filter((filename) => filename.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

export function checksumSql(contents: string) {
  return new Bun.CryptoHasher("sha256").update(contents).digest("hex");
}

export async function readSqlFiles(directory = defaultMigrationsDir): Promise<MigrationFile[]> {
  const filenames = sortSqlFilenames(
    await Array.fromAsync(new Glob("*.sql").scan({ cwd: directory })),
  );

  return Promise.all(
    filenames.map(async (filename) => {
      const path = `${directory}/${filename}`;
      const contents = await Bun.file(path).text();

      return {
        filename,
        path,
        contents,
        checksum: checksumSql(contents),
      };
    }),
  );
}

export async function runMigrations(database: SQL = Bun.sql, directory = defaultMigrationsDir) {
  const files = await readSqlFiles(directory);
  const result: MigrationResult = {
    applied: [],
    skipped: [],
  };

  await database`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const appliedRows = await database<MigrationRow[]>`
    SELECT filename, checksum
    FROM schema_migrations
    ORDER BY filename ASC
  `;
  const applied = new Map(appliedRows.map((row) => [row.filename, row.checksum]));

  for (const file of files) {
    const existingChecksum = applied.get(file.filename);

    if (existingChecksum === file.checksum) {
      result.skipped.push(file.filename);
      continue;
    }

    if (existingChecksum) {
      throw new Error(`Migration checksum changed after it was applied: ${file.filename}`);
    }

    await database.begin(async (transaction) => {
      await transaction.unsafe(file.contents);
      await transaction`
        INSERT INTO schema_migrations (filename, checksum)
        VALUES (${file.filename}, ${file.checksum})
      `;
    });

    result.applied.push(file.filename);
  }

  return result;
}

if (import.meta.main) {
  const result = await runMigrations();

  console.log(
    JSON.stringify(
      {
        status: "ok",
        ...result,
      },
      null,
      2,
    ),
  );
}
