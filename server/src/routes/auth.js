import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { JsonStore } from '../storage/jsonStore.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const users = new JsonStore('users');

// Public: login only
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const [user] = await users.list((u) => u.email === email);
  if (!user || user.status === 'disabled') {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign(
    { id: user.id, email: user.email, display_name: user.display_name },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
  const { password_hash: _, ...safe } = user;
  res.json({ token, user: safe });
});

// Protected: current user profile
router.get('/me', authMiddleware, async (req, res) => {
  const user = await users.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password_hash: _, ...safe } = user;
  res.json(safe);
});

// Protected: register new user (admin-only action)
router.post('/register', authMiddleware, async (req, res) => {
  const { email, password, display_name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const existing = await users.list((u) => u.email === email);
  if (existing.length > 0) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const password_hash = await bcrypt.hash(password, 10);
  const user = await users.create({
    email,
    password_hash,
    display_name: display_name || email.split('@')[0],
    roles: [],
    status: 'active',
  });
  const { password_hash: _, ...safe } = user;
  res.status(201).json(safe);
});

export default router;
