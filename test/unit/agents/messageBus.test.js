/**
 * Unit tests for MessageBus — Module 6: Collaborative Agentic AI
 */

const MessageBus = require('../../../agents/messageBus');

describe('MessageBus — Module 6 Inter-Agent Communication', () => {
  let bus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  test('successfully publishes messages and assigns sequential IDs and timestamps', () => {
    const msg1 = bus.publish('planner', 'database', 'task:assigned', { taskId: 't1' });
    const msg2 = bus.publish('database', 'backend', 'schema:updated', { tables: ['students'] });

    expect(msg1.id).toBe(1);
    expect(msg1.from).toBe('planner');
    expect(msg1.to).toBe('database');
    expect(msg1.topic).toBe('task:assigned');
    expect(msg1.timestamp).toBeDefined();

    expect(msg2.id).toBe(2);
    expect(bus.getLog().length).toBe(2);
  });

  test('calls subscribed topic handlers synchronously with payload and message', () => {
    const mockHandler = jest.fn();
    bus.subscribe('schema:updated', mockHandler);

    bus.publish('database', 'all', 'schema:updated', { tables: ['students', 'courses'] });

    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledWith(
      { tables: ['students', 'courses'] },
      expect.objectContaining({ from: 'database', topic: 'schema:updated' })
    );
  });

  test('allows unsubscribing from a topic', () => {
    const mockHandler = jest.fn();
    const unsubscribe = bus.subscribe('review:issues', mockHandler);

    bus.publish('reviewer', 'frontend', 'review:issues', { count: 2 });
    expect(mockHandler).toHaveBeenCalledTimes(1);

    unsubscribe();

    bus.publish('reviewer', 'frontend', 'review:issues', { count: 0 });
    expect(mockHandler).toHaveBeenCalledTimes(1); // not called again
  });

  test('broadcast sends messages with to="all"', () => {
    const msg = bus.broadcast('planner', 'plan:created', { taskCount: 4 });
    expect(msg.to).toBe('all');
    expect(bus.getMessagesTo('database').length).toBe(1);
    expect(bus.getMessagesTo('frontend').length).toBe(1);
  });

  test('filters message log by sender and receiver correctly', () => {
    bus.publish('planner', 'database', 'task:1', {});
    bus.publish('database', 'backend', 'schema:1', {});
    bus.publish('reviewer', 'frontend', 'review:1', {});
    bus.broadcast('orchestrator', 'done', {});

    expect(bus.getMessagesFrom('database').length).toBe(1);
    expect(bus.getMessagesTo('backend').length).toBe(2); // 1 direct + 1 broadcast ('all')
    expect(bus.getMessagesTo('frontend').length).toBe(2); // 1 direct + 1 broadcast ('all')
  });

  test('catches handler exceptions without breaking the publishing loop', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const faultyHandler = jest.fn().mockImplementation(() => {
      throw new Error('Handler crash');
    });
    const goodHandler = jest.fn();

    bus.subscribe('event:test', faultyHandler);
    bus.subscribe('event:test', goodHandler);

    expect(() => {
      bus.publish('agent1', 'agent2', 'event:test', { ok: true });
    }).not.toThrow();

    expect(faultyHandler).toHaveBeenCalledTimes(1);
    expect(goodHandler).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});

