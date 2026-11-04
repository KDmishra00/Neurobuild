/**
 * MessageBus — Module 6: Collaborative Agentic AI
 *
 * A lightweight publish/subscribe bus that agents use to communicate.
 * Every message is logged chronologically so the frontend can replay
 * the agent conversation and the run history can be persisted.
 *
 * Agents publish to a topic (e.g. 'schema:updated') and subscribers
 * receive the payload. The bus is synchronous — it calls all subscribers
 * immediately in registration order, keeping the orchestrator simple.
 */

class MessageBus {
  constructor() {
    /** @type {Map<string, Array<function>>} topic → [handler, ...] */
    this._subscribers = new Map();

    /** Chronological log of every message sent on this bus. */
    this.log = [
      // { id, timestamp, from, to, topic, payload }
    ];

    this._nextId = 1;
  }

  // ── Subscriptions ──────────────────────────────────────────────────────

  /**
   * Subscribe to a topic.
   * @param {string}   topic    — e.g. 'schema:updated', 'review:issues'
   * @param {function} handler  — called with (payload, message) when published
   * @returns {function} unsubscribe function
   */
  subscribe(topic, handler) {
    if (!this._subscribers.has(topic)) {
      this._subscribers.set(topic, []);
    }
    this._subscribers.get(topic).push(handler);
    return () => this.unsubscribe(topic, handler);
  }

  /** Remove a specific handler from a topic. */
  unsubscribe(topic, handler) {
    const handlers = this._subscribers.get(topic);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  // ── Publishing ─────────────────────────────────────────────────────────

  /**
   * Publish a message to a topic.
   * @param {string} from     — sender agent name (e.g. 'database')
   * @param {string} to       — recipient agent name or 'all'
   * @param {string} topic    — event topic
   * @param {any}    payload  — message data
   * @returns {object} the recorded message
   */
  publish(from, to, topic, payload = {}) {
    const message = {
      id: this._nextId++,
      timestamp: new Date().toISOString(),
      from,
      to,
      topic,
      payload
    };

    this.log.push(message);
    console.log(`[MessageBus] ${from} → ${to} [${topic}]`);

    // Notify subscribers
    const handlers = this._subscribers.get(topic) || [];
    for (const handler of handlers) {
      try {
        handler(payload, message);
      } catch (err) {
        console.error(`[MessageBus] Handler error for topic "${topic}":`, err.message);
      }
    }

    return message;
  }

  // ── Convenience helpers ─────────────────────────────────────────────────

  /** Broadcast to all agents (to = 'all'). */
  broadcast(from, topic, payload = {}) {
    return this.publish(from, 'all', topic, payload);
  }

  /** Get all messages sent from a specific agent. */
  getMessagesFrom(agentName) {
    return this.log.filter(m => m.from === agentName);
  }

  /** Get all messages sent to a specific agent. */
  getMessagesTo(agentName) {
    return this.log.filter(m => m.to === agentName || m.to === 'all');
  }

  /** Get the full message log (safe copy). */
  getLog() {
    return [...this.log];
  }

  /** Reset the bus (used in tests). */
  reset() {
    this._subscribers.clear();
    this.log = [];
    this._nextId = 1;
  }
}

module.exports = MessageBus;

