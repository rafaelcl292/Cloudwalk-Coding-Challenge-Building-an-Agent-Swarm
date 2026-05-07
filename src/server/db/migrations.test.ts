import { describe, expect, test } from "bun:test";
import { checksumSql, sortSqlFilenames } from "../../../scripts/migrate";

describe("database migration helpers", () => {
  test("sortSqlFilenames keeps only sql files in lexical order", () => {
    expect(sortSqlFilenames(["002_second.sql", "README.md", "001_first.sql"])).toEqual([
      "001_first.sql",
      "002_second.sql",
    ]);
  });

  test("checksumSql returns stable sha256 hex digests", () => {
    expect(checksumSql("select 1;")).toBe(checksumSql("select 1;"));
    expect(checksumSql("select 1;")).not.toBe(checksumSql("select 2;"));
  });
});
