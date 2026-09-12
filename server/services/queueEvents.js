const { EventEmitter } = require('events');

// Lightweight queue-change bus backing the SSE stream (GET /api/v1/queue/stream).
// Controllers call bumpQueue() after any mutation that changes queue ordering or
// content (submit, triage confirm/override, assign, escalate, status change).
const emitter = new EventEmitter();
emitter.setMaxListeners(200);
let version = 0;

function bumpQueue(reason = 'queue-updated') {
  version += 1;
  const event = { version, reason, at: new Date().toISOString() };
  emitter.emit('queue', event);
  return event;
}

function currentVersion() {
  return version;
}

function subscribe(handler) {
  emitter.on('queue', handler);
  return () => emitter.off('queue', handler);
}

module.exports = { bumpQueue, currentVersion, subscribe };
