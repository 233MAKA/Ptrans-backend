require('dotenv').config();

const cors = require('cors');
const express = require('express');

const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const githubRoutes = require('./routes/github');
const userRoutes = require('./routes/users');
const notesRoutes = require('./routes/notes');

const app = express();
const port = Number(process.env.PORT || 8091);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((item) => item.trim())
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:9000',
          'http://localhost:5404',
          'http://localhost:5405',
          'http://localhost:5406',
          'http://localhost:5672',
          'http://localhost:8080',
          'http://localhost:8090',
          'http://localhost:9090',
          'http://localhost:9999',
          'http://localhost:15672',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
          'http://127.0.0.1:5404',
          'http://127.0.0.1:5405',
          'http://127.0.0.1:5406',
          'http://127.0.0.1:9090',
        ];

    const isLocalNetwork =
      /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d+$/.test(
        origin,
      );

    if (allowedOrigins.includes(origin) || isLocalNetwork) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/users', userRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notes', notesRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  const status = Number(err?.status || 500);
  const message = err?.message || 'Internal server error';
  res.status(status).json({ message });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Ptrans-backend listening on port ${port}`);
  console.log(`Local: http://localhost:${port}`);

  try {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(networkInterfaces)) {
      for (const net of networkInterfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push(net.address);
        }
      }
    }

    if (addresses.length > 0) {
      console.log(`Network: http://${addresses[0]}:${port}`);
    }
  } catch (error) {
    console.warn('Unable to read network interfaces:', error?.message || error);
  }
});
