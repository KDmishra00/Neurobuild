require('../setup');
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const Project = require('../../models/Project');
const { createTestUser, createTestProject, authHeader } = require('../helpers');

const app = express();
app.use(express.json());
app.use('/api/projects', require('../../routes/projects'));

describe('Projects Integration', () => {
  let token, userId;

  beforeEach(async () => {
    const result = await createTestUser();
    token = result.token;
    userId = result.user._id;
  });

  test('GET /api/projects — lists user projects with pagination', async () => {
    await createTestProject(userId, { name: 'Project A' });
    await createTestProject(userId, { name: 'Project B' });

    const res = await request(app)
      .get('/api/projects')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(2);
  });

  test('GET /api/projects — search filter', async () => {
    await createTestProject(userId, { name: 'Portfolio Site' });
    await createTestProject(userId, { name: 'Landing Page' });

    const res = await request(app)
      .get('/api/projects?search=Portfolio')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.projects[0].name).toBe('Portfolio Site');
  });

  test('POST /api/projects — creates a project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'New Site', prompt: 'a blog', html: '<h1>Blog</h1>' });

    expect(res.status).toBe(201);
    expect(res.body.project.name).toBe('New Site');
  });

  test('GET /api/projects/:id — gets project with versions', async () => {
    const project = await createTestProject(userId);

    const res = await request(app)
      .get(`/api/projects/${project._id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.project.html).toBeDefined();
    expect(res.body.project.versions).toBeDefined();
  });

  test('PATCH /api/projects/:id — updates and creates version', async () => {
    const project = await createTestProject(userId, { html: '<h1>V1</h1>' });

    const res = await request(app)
      .patch(`/api/projects/${project._id}`)
      .set(authHeader(token))
      .send({ html: '<h1>V2</h1>' });

    expect(res.status).toBe(200);

    // Verify version was created
    const updated = await Project.findById(project._id);
    expect(updated.html).toBe('<h1>V2</h1>');
    expect(updated.versions).toHaveLength(1);
    expect(updated.versions[0].html).toBe('<h1>V1</h1>');
  });

  test('POST /api/projects/:id/restore/:versionIndex — restores version', async () => {
    const project = await createTestProject(userId, { html: '<h1>Current</h1>' });
    project.versions.unshift({ html: '<h1>Old</h1>', prompt: 'old prompt' });
    await project.save();

    const res = await request(app)
      .post(`/api/projects/${project._id}/restore/0`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.restoredFrom).toBe(0);

    const restored = await Project.findById(project._id);
    expect(restored.html).toBe('<h1>Old</h1>');
  });

  test('GET /api/projects/:id/versions/:index — gets specific version', async () => {
    const project = await createTestProject(userId);
    project.versions.unshift({ html: '<h1>Saved V</h1>', prompt: 'saved' });
    await project.save();

    const res = await request(app)
      .get(`/api/projects/${project._id}/versions/0`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.version.html).toBe('<h1>Saved V</h1>');
  });

  test('DELETE /api/projects/:id — deletes project', async () => {
    const project = await createTestProject(userId);

    const res = await request(app)
      .delete(`/api/projects/${project._id}`)
      .set(authHeader(token));

    expect(res.status).toBe(204);
    const found = await Project.findById(project._id);
    expect(found).toBeNull();
  });

  test('should not see other user\'s projects', async () => {
    const otherUser = await createTestUser({ email: 'other@test.com' });
    await createTestProject(otherUser.user._id, { name: 'Private' });

    const res = await request(app)
      .get('/api/projects')
      .set(authHeader(token));

    expect(res.body.projects).toHaveLength(0);
  });
});
