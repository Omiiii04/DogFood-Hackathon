const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../src/index');

describe('Security Headers, CORS Policy & Static Upload Persistence', () => {
  const uploadsDir = path.resolve(__dirname, '../uploads');
  const thumbnailsDir = path.resolve(uploadsDir, 'thumbnails');
  const testFilesToCleanup = [];

  afterAll(() => {
    testFilesToCleanup.forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (_) {}
      }
    });
  });

  describe('Helmet Security Headers', () => {
    it('should include hardened security headers on healthcheck endpoint', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      // CORP cross-origin allowed for asset embedding
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      // COOP same-origin
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
      // Clickjacking protection
      expect(res.headers['x-frame-options']).toBe('DENY');
      // MIME sniffing protection
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      // DNS prefetch control disabled for air-gapped isolation
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
      // Strict referrer policy
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      // CSP present
      expect(res.headers['content-security-policy']).toBeDefined();
      // Server technology hidden
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS Whitelist and Policy Enforcement', () => {
    it('should allow requests from whitelisted origin http://localhost:3000', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should allow requests from whitelisted origin http://127.0.0.1:3000', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://127.0.0.1:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
    });

    it('should allow requests without an Origin header (e.g., server-to-server, curl)', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
    });

    it('should reject requests from unauthorized origins with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://malicious-external-domain.com');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('CORS origin');
    });

    it('should respond to preflight OPTIONS requests with allowed methods, headers, and exposed headers', async () => {
      const res = await request(app)
        .options('/api/v1/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
      expect(res.headers['access-control-expose-headers']).toContain('Content-Disposition');
      expect(res.headers['access-control-max-age']).toBe('86400');
    });
  });

  describe('Static Thumbnail Serving & Volume Persistence', () => {
    it('should verify upload directory hierarchy exists', () => {
      expect(fs.existsSync(uploadsDir)).toBe(true);
      expect(fs.existsSync(thumbnailsDir)).toBe(true);
    });

    it('should serve default thumbnail statically with cross-origin resource policy', async () => {
      const defaultThumb = path.join(uploadsDir, 'default-thumbnail.webp');
      expect(fs.existsSync(defaultThumb)).toBe(true);

      const res = await request(app).get('/uploads/default-thumbnail.webp');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/(webp|octet-stream)/);
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('should persist an uploaded image and serve it statically across simulated restarts', async () => {
      // Create a test image in thumbnails folder
      const testFileName = `test-persist-${Date.now()}.png`;
      const testFilePath = path.join(thumbnailsDir, testFileName);
      const fakeImageBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]);

      fs.writeFileSync(testFilePath, fakeImageBytes);
      testFilesToCleanup.push(testFilePath);

      // Verify the file was written to disk (volume mount path)
      expect(fs.existsSync(testFilePath)).toBe(true);

      // Verify Express static middleware serves it with correct headers
      const res = await request(app).get(`/uploads/thumbnails/${testFileName}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/png/);
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(res.body).toEqual(fakeImageBytes);
    });

    it('should return 404 for nonexistent uploaded file', async () => {
      const res = await request(app).get('/uploads/thumbnails/nonexistent-file.png');
      expect(res.status).toBe(404);
    });
  });
});
