const { Pool, types } = require('pg');
require('dotenv').config();

// PostgreSQL DATE columns (OID 1082) are parsed by node-postgres into JS Date
// objects at UTC midnight. When serialized to JSON and later sliced to
// "YYYY-MM-DD" on the frontend, this silently shifts the date back by one
// day for any timezone ahead of UTC (e.g. Pakistan, UTC+5). Returning the
// raw string instead avoids any timezone conversion entirely.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;
