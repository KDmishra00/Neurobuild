require('../../setup');
const mongoose = require('mongoose');
const Project = require('../../../models/Project');

describe('Project Model', () => {
  const ownerId = new mongoose.Types.ObjectId();

  test('should create a project with required fields', async () => {
    const project = await Project.create({
      owner: ownerId,
      name: 'My Website',
      prompt: 'A portfolio site',
      html: '<!DOCTYPE html><html><body>Hello</body></html>'
    });

    expect(project.name).toBe('My Website');
    expect(project.prompt).toBe('A portfolio site');
    expect(project.versions).toHaveLength(0);
    expect(project.tags).toHaveLength(0);
    expect(project.isPublic).toBe(false);
    expect(project.createdAt).toBeDefined();
  });

  test('should enforce required fields', async () => {
    let error;
    try {
      await Project.create({});
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.owner).toBeDefined();
    expect(error.errors.name).toBeDefined();
  });

  test('should store version history', async () => {
    const project = await Project.create({
      owner: ownerId,
      name: 'Versioned Project',
      html: '<h1>V1</h1>'
    });

    project.versions.unshift({
      html: project.html,
      prompt: 'original prompt'
    });
    project.html = '<h1>V2</h1>';
    await project.save();

    expect(project.versions).toHaveLength(1);
    expect(project.versions[0].html).toBe('<h1>V1</h1>');
    expect(project.html).toBe('<h1>V2</h1>');
  });

  test('should support tags', async () => {
    const project = await Project.create({
      owner: ownerId,
      name: 'Tagged',
      tags: ['portfolio', 'dark-theme', 'responsive']
    });
    expect(project.tags).toEqual(['portfolio', 'dark-theme', 'responsive']);
  });

  test('should enforce name maxlength', async () => {
    let error;
    try {
      await Project.create({
        owner: ownerId,
        name: 'A'.repeat(81)
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
  });
});
