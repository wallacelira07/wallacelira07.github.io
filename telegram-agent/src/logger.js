// src/logger.js
// Logger mínimo. Regra dura: NUNCA logar o corpo de segredos (tokens, chaves,
// Authorization headers) nem o SUPABASE_SERVICE_ROLE_KEY, mesmo em debug.

function timestamp() {
  return new Date().toISOString();
}

function info(...args) {
  console.log(`[${timestamp()}] [info]`, ...args);
}

function warn(...args) {
  console.warn(`[${timestamp()}] [warn]`, ...args);
}

function error(...args) {
  console.error(`[${timestamp()}] [error]`, ...args);
}

module.exports = { info, warn, error };
