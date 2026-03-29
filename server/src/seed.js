import bcrypt from 'bcryptjs';
import { JsonStore } from './storage/jsonStore.js';

const users = new JsonStore('users');

async function seed() {
  await users.init();
  const existing = await users.list((u) => u.email === 'admin@proofforge.local');
  if (existing.length > 0) {
    console.log('Admin user already exists');
    return;
  }

  const password = process.env.ADMIN_PASSWORD || 'admin';
  if (password === 'admin') {
    console.warn('WARNING: Using default admin password. Set ADMIN_PASSWORD env var for production.');
  }

  const password_hash = await bcrypt.hash(password, 10);
  const user = await users.create({
    email: 'admin@proofforge.local',
    password_hash,
    display_name: 'Admin',
    roles: ['Administrator'],
    status: 'active',
  });
  console.log(`Created admin user (id=${user.id}): admin@proofforge.local`);
}

seed().catch(console.error);
