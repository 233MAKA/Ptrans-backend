require('dotenv').config();

const cors = require('cors');
const express = require('express');

const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const userRoutes = require('./routes/users');

const app = express();
const port = Number(process.env.PORT || 8091);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/documents', documentRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  const status = Number(err?.status || 500);
  const message = err?.message || 'Internal server error';
  res.status(status).json({ message });
});

app.listen(port, () => {
  console.log(`Ptrans-backend listening on port ${port}`);
});
