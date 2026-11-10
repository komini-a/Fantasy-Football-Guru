import "server-only";
import mysql, { type Pool, type QueryResult } from "mysql2/promise";
import { isIP } from "node:net";
import { requiredEnvironmentVariable } from "@/lib/env";

type QueryParameter = string | number | boolean | Date | Buffer | null;
const databaseGlobal = globalThis as typeof globalThis & { mysqlPool?: Pool };

function getPool(): Pool {
  // Initialize on the first query so pages can build without database credentials.
  if (!databaseGlobal.mysqlPool) {
    const port = Number(requiredEnvironmentVariable("DB_PORT"));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("DB_PORT must be an integer between 1 and 65535");
    }

    // Reuse the pool across requests and development hot reloads.
    const host = requiredEnvironmentVariable("DB_HOST");
    const local = ["127.0.0.1", "localhost", "::1"].includes(host);
    if (!local && isIP(host))
      throw new Error("Use the remote database's TLS hostname for DB_HOST.");
    databaseGlobal.mysqlPool = mysql.createPool({
      host,
      ssl: local ? undefined : {
        rejectUnauthorized: true,
        verifyIdentity: true,
        minVersion: "TLSv1.2",
        ca: process.env.DB_SSL_CA,
      },
      port,
      user: requiredEnvironmentVariable("DB_USER"),
      password: requiredEnvironmentVariable("DB_PASSWORD"),
      database: requiredEnvironmentVariable("DB_NAME"),
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 20,
      connectTimeout: 5000,
    });
  }
  return databaseGlobal.mysqlPool;
}

export async function query<T extends QueryResult>(
  sql: string,
  parameters: QueryParameter[] = [],
): Promise<T> {
  const [rows] = await getPool().execute<T>(sql, parameters);
  return rows;
}
