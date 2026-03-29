import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import config from '../config.js';

const router = Router();

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    const { runId, stepId, attemptNum } = req.params;
    const dir = path.join(config.dataDir, 'attachments', runId, stepId, attemptNum);
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${file.originalname}`;
    cb(null, unique);
  },
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Upload attachment to a specific step attempt
router.post('/:runId/:stepId/:attemptNum', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { runId, stepId, attemptNum } = req.params;
  res.json({
    filename: req.file.originalname,
    storage_path: `${runId}/${stepId}/${attemptNum}/${req.file.filename}`,
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploaded_at: new Date().toISOString(),
    uploaded_by: req.user.id,
  });
});

// Serve attachment file
router.get('/:runId/:stepId/:attemptNum/:filename', async (req, res) => {
  const filePath = path.join(
    config.dataDir,
    'attachments',
    req.params.runId,
    req.params.stepId,
    req.params.attemptNum,
    req.params.filename
  );
  try {
    await fs.access(filePath);
    res.sendFile(filePath);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

export default router;
