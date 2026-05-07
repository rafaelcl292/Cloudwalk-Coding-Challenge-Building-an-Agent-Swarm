import { Glob, type SQL } from "bun";
import { sortSqlFilenames } from "./migrate";

export type SeedResult = {
  applied: string[];
};

const defaultSeedsDir = new URL("../db/seeds", import.meta.url).pathname;

export async function runSeeds(database: SQL = Bun.sql, directory = defaultSeedsDir) {
  const result: SeedResult = {
    applied: [],
  };
  const filenames = sortSqlFilenames(
    await Array.fromAsync(new Glob("*.sql").scan({ cwd: directory })),
  );

  for (const filename of filenames) {
    const contents = await Bun.file(`${directory}/${filename}`).text();

    await database.unsafe(contents);
    result.applied.push(filename);
  }

  return result;
}

if (import.meta.main) {
  const result = await runSeeds();

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
