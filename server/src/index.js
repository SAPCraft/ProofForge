import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import scenarioRoutes from './routes/scenarios.js';
import planRoutes from './routes/plans.js';
import runRoutes from './routes/runs.js';
import defectRoutes from './routes/defects.js';
import attachmentRoutes from './routes/attachments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/scenarios', authMiddleware, scenarioRoutes);
app.use('/api/plans', authMiddleware, planRoutes);
app.use('/api/runs', authMiddleware, runRoutes);
app.use('/api/defects', authMiddleware, defectRoutes);
app.use('/api/attachments', authMiddleware, attachmentRoutes);

// Serve static frontend
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`ProofForge server running on port ${config.port}`);
});
