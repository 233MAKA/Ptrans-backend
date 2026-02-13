const { randomBytes, randomUUID } = require('crypto');

function generateId() {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }

  return randomBytes(16).toString('hex');
}

module.exports = generateId;
