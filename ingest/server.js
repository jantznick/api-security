import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import inventoryRoutes from './routes/inventory.js';

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ingest', date: new Date().toISOString() });
});

app.use('/v1/inventory', inventoryRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ingest API running on port ${PORT}`);
});
