const bcrypt = require('bcryptjs');
const pool = require('./pool');

const BRANCHES = [
  { name: 'Rehmat & Sons Hasilpur', location: 'Hasilpur' },
  { name: 'Rehmat & Sons Chishtian', location: 'Chishtian' },
  { name: 'Yazman Motors Bahawalpur', location: 'Bahawalpur' },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert branches (idempotent-ish: skip if already present by name)
    const branchIds = [];
    for (const b of BRANCHES) {
      const existing = await client.query('SELECT id FROM branches WHERE name = $1', [b.name]);
      if (existing.rows.length > 0) {
        branchIds.push(existing.rows[0].id);
        continue;
      }
      const res = await client.query(
        'INSERT INTO branches (name, location) VALUES ($1, $2) RETURNING id',
        [b.name, b.location]
      );
      branchIds.push(res.rows[0].id);
    }

    // 2. Super Admin (branch_id = NULL, sees all branches)
    const superAdminExists = await client.query(
      "SELECT id FROM users WHERE branch_id IS NULL AND username = 'superadmin'"
    );
    if (superAdminExists.rows.length === 0) {
      const hash = await bcrypt.hash('ChangeMe123!', 10);
      await client.query(
        `INSERT INTO users (name, username, password_hash, role, branch_id)
         VALUES ($1, $2, $3, 'super_admin', NULL)`,
        ['Super Admin', 'superadmin', hash]
      );
      console.log('Created super_admin -> username: superadmin / password: ChangeMe123!');
    }

    // 3. One manager account per branch (for initial testing/login)
    for (let i = 0; i < branchIds.length; i++) {
      const branchId = branchIds[i];
      const username = 'manager'; // same username string, but unique because scoped per-branch
      const exists = await client.query(
        'SELECT id FROM users WHERE branch_id = $1 AND username = $2',
        [branchId, username]
      );
      if (exists.rows.length === 0) {
        const hash = await bcrypt.hash('ChangeMe123!', 10);
        await client.query(
          `INSERT INTO users (name, username, password_hash, role, branch_id)
           VALUES ($1, $2, $3, 'manager', $4)`,
          [`Manager - ${BRANCHES[i].name}`, username, hash, branchId]
        );
        console.log(`Created manager for "${BRANCHES[i].name}" -> username: manager / password: ChangeMe123! (branch_id=${branchId})`);
      }
    }

    await client.query('COMMIT');
    console.log('Seeding complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
