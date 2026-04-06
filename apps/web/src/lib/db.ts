import sql from "mssql";

const config: sql.config = {
  server: process.env.DB_SERVER ?? "localhost",
  database: process.env.DB_NAME ?? "PusulaHub",
  user: process.env.DB_USER ?? "SA",
  password: process.env.DB_PASSWORD ?? "",
  port: parseInt(process.env.DB_PORT ?? "1433"),
  options: {
    trustServerCertificate: true,
    encrypt: false,
  },
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 120000,
  },
};

declare global {
  // eslint-disable-next-line no-var
  var _mssqlPool: sql.ConnectionPool | undefined;
}

async function getPool(): Promise<sql.ConnectionPool> {
  if (global._mssqlPool && global._mssqlPool.connected) {
    return global._mssqlPool;
  }
  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  global._mssqlPool = pool;
  return pool;
}

export async function query<T = sql.IRecordSet<Record<string, unknown>>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T> {
  const pool = await getPool();
  const request = pool.request();

  let queryText = "";
  strings.forEach((str, i) => {
    queryText += str;
    if (i < values.length) {
      const paramName = `p${i}`;
      request.input(paramName, values[i]);
      queryText += `@${paramName}`;
    }
  });

  const result = await request.query(queryText);
  return result.recordset as T;
}

export async function execute(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<sql.IResult<unknown>> {
  const pool = await getPool();
  const request = pool.request();

  let queryText = "";
  strings.forEach((str, i) => {
    queryText += str;
    if (i < values.length) {
      const paramName = `p${i}`;
      request.input(paramName, values[i]);
      queryText += `@${paramName}`;
    }
  });

  return request.query(queryText);
}

export { sql };
