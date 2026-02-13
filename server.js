require('dotenv').config();

const cors = require('cors');
const express = require('express');

const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const userRoutes = require('./routes/users');

const app = express();
const port = Number(process.env.PORT || 8091);

// CORS configuration - allows frontend from different origins to access the API
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // List of allowed origins from environment variable or defaults
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : [
          'http://localhost:3000',
          'http://localhost:3001', 
          'http://localhost:5404',
          'http://localhost:5405',
          'http://localhost:5406',
          'http://localhost:5672',
          'http://localhost:8080',
          'http://localhost:8090',
          'http://localhost:9999',
          'http://localhost:15672',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
          'http://127.0.0.1:5404',
          'http://127.0.0.1:5405',
          'http://127.0.0.1:5406',
        ];
    
    // Check if origin is allowed or if it's from local network (192.168.x.x or 10.x.x.x)
    const isLocalNetwork = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d+$/.test(origin);
    
    if (allowedOrigins.includes(origin) || isLocalNetwork) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies and authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/documents', documentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Error handler
app.use((err, _req, res, _next) => {
  const status = Number(err?.status || 500);
  const message = err?.message || 'Internal server error';
  res.status(status).json({ message });
});

// Start server on all network interfaces (0.0.0.0) to allow LAN access
app.listen(port, '0.0.0.0', () => {
  console.log(`Ptrans-backend listening on port ${port}`);
  console.log(`Local: http://localhost:${port}`);
  
  // Show local network IP if available
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  
  if (addresses.length > 0) {
    console.log(`Network: http://${addresses[0]}:${port}`);
  }
});