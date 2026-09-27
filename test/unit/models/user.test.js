require('../../setup');
const User = require('../../../models/User');

describe('User Model', () => {
  test('should hash password on save', async () => {
    const user = new User({
      username: 'alice_user',
      name: 'Alice',
      email: 'alice@example.com',
      password: 'plaintext123'
    });
    await user.save();

    expect(user.password).not.toBe('plaintext123');
    expect(user.password).toMatch(/^\$2[aby]?\$/);
  });

  test('should compare password correctly', async () => {
    const user = new User({
      username: 'bob_user',
      name: 'Bob',
      email: 'bob@example.com',
      password: 'secret456'
    });
    await user.save();

    const isMatch = await user.comparePassword('secret456');
    expect(isMatch).toBe(true);

    const isWrong = await user.comparePassword('wrongpassword');
    expect(isWrong).toBe(false);
  });

  test('should enforce required fields', async () => {
    const user = new User({});
    let error;
    try {
      await user.save();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.username).toBeDefined();
    expect(error.errors.name).toBeDefined();
    expect(error.errors.email).toBeDefined();
    expect(error.errors.password).toBeDefined();
  });

  test('should enforce unique email', async () => {
    await User.create({ username: 'user_a', name: 'A', email: 'dupe@example.com', password: '12345678' });
    let error;
    try {
      await User.create({ username: 'user_b', name: 'B', email: 'dupe@example.com', password: '65432178' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.code).toBe(11000);
  });

  test('should lowercase email', async () => {
    const user = await User.create({
      username: 'carol_user',
      name: 'Carol',
      email: 'Carol@EXAMPLE.com',
      password: '12345678'
    });
    expect(user.email).toBe('carol@example.com');
  });

  test('should have default settings', async () => {
    const user = await User.create({
      username: 'dave_user',
      name: 'Dave',
      email: 'dave@example.com',
      password: '12345678'
    });
    expect(user.settings.darkMode).toBe(true);
    expect(user.settings.compact).toBe(false);
    expect(user.settings.autoPreview).toBe(true);
    expect(user.generationCount).toBe(0);
  });

  test('should not rehash password if not modified', async () => {
    const user = await User.create({
      username: 'eve_user',
      name: 'Eve',
      email: 'eve@example.com',
      password: 'mypassword'
    });
    const originalHash = user.password;

    user.name = 'Eve Updated';
    await user.save();

    expect(user.password).toBe(originalHash);
  });
});
