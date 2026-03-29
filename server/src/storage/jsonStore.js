import fs from 'fs/promises';
import path from 'path';
import config from '../config.js';

const countersPath = path.join(config.dataDir, 'counters.json');
const locks = new Map();

async function withLock(key, fn) {
  while (locks.get(key)) {
    await new Promise((r) => setTimeout(r, 10));
  }
  locks.set(key, true);
  try {
    return await fn();
  } finally {
    locks.delete(key);
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readCounters() {
  try {
    const raw = await fs.readFile(countersPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeCounters(counters) {
  await fs.writeFile(countersPath, JSON.stringify(counters, null, 2));
}

export class JsonStore {
  constructor(entityType) {
    this.entityType = entityType;
    this.dir = path.join(config.dataDir, entityType);
  }

  async init() {
    await ensureDir(this.dir);
  }

  async nextId() {
    return withLock('counters', async () => {
      const counters = await readCounters();
      const next = (counters[this.entityType] || 0) + 1;
      counters[this.entityType] = next;
      await writeCounters(counters);
      return next;
    });
  }

  filePath(id) {
    return path.join(this.dir, `${id}.json`);
  }

  async get(id) {
    try {
      const raw = await fs.readFile(this.filePath(id), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async list(filterFn) {
    await ensureDir(this.dir);
    const files = await fs.readdir(this.dir);
    const items = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await fs.readFile(path.join(this.dir, file), 'utf-8');
      const item = JSON.parse(raw);
      if (!filterFn || filterFn(item)) {
        items.push(item);
      }
    }
    return items;
  }

  async create(data, userId) {
    const id = await this.nextId();
    const now = new Date().toISOString();
    const entity = {
      id,
      entity_type: this.entityType,
      ...data,
      tags: data.tags || [],
      custom_fields: data.custom_fields || {},
      created_at: now,
      created_by: userId || null,
      updated_at: now,
      updated_by: userId || null,
    };
    await ensureDir(this.dir);
    await fs.writeFile(this.filePath(id), JSON.stringify(entity, null, 2));
    return entity;
  }

  async update(id, data, userId) {
    const existing = await this.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...data,
      id: existing.id,
      entity_type: existing.entity_type,
      created_at: existing.created_at,
      created_by: existing.created_by,
      updated_at: new Date().toISOString(),
      updated_by: userId || existing.updated_by,
    };
    await fs.writeFile(this.filePath(id), JSON.stringify(updated, null, 2));
    return updated;
  }

  async delete(id) {
    try {
      await fs.unlink(this.filePath(id));
      return true;
    } catch {
      return false;
    }
  }
}
