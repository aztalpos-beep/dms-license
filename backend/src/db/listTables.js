const { Pool } = require('pg');
const pool = new Pool({
  connectionString: "postgresql://postgres:XYHslDJxsBbKDjgicyYrbCqwqGfuyEKG@hopper.proxy.rlwy.net:21740/railway"
});
async function run() {
  try {
    const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.table(result.rows);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}
run();
