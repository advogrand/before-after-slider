const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/host') {
        res.setHeader('Content-Type', 'text/html');
        return res.end('<iframe title="test" src="/repo/?project=sales" style="width:100%;height:300px;border:0"></iframe>');
      }
      if (!pathname.startsWith('/repo/')) throw new Error('Not found');
      const file = path.resolve(root, '.' + pathname.slice('/repo'.length) + (pathname.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(root + path.sep)) throw new Error('Not found');
      const data = await fs.readFile(file);
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base + '/repo/?project=sales');
    await page.locator('#comparison').waitFor({ state: 'visible' });
    const slider = page.locator('#slider');
    assert.equal(await slider.inputValue(), '50');
    assert.equal(await page.locator('#before').evaluate(img => img.naturalWidth), 2000);
    if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await slider.inputValue(), '51');
    await page.keyboard.press('Home');
    assert.equal(await slider.inputValue(), '0');
    await page.keyboard.press('End');
    assert.equal(await slider.inputValue(), '100');
    const rect = await slider.boundingBox();
    await page.mouse.move(rect.x + rect.width * 0.25, rect.y + rect.height / 2);
    await page.mouse.down();
    assert.equal(await slider.inputValue(), '25');
    await page.mouse.move(rect.x + rect.width * 0.75, rect.y + 20);
    assert.equal(await slider.inputValue(), '75');
    await page.mouse.move(rect.x - 30, rect.y + 20);
    assert.equal(await slider.inputValue(), '0');
    await page.mouse.up();
    await page.mouse.move(rect.x + rect.width * 0.5, rect.y + 20);
    assert.equal(await slider.inputValue(), '0');
    await page.setViewportSize({ width: 375, height: 700 });
    const mobileRect = await slider.boundingBox();
    assert(Math.abs(mobileRect.width / mobileRect.height - 2000 / 1121) < 0.01);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 350 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 280, y: 350 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(Math.abs(Number(await slider.inputValue()) - 75) <= 1);
    await page.goto(base + '/repo/?project=demo');
    await page.locator('#comparison').waitFor({ state: 'visible' });
    assert.equal(await slider.inputValue(), '50');
    await page.goto(base + '/repo/?project=__proto__');
    await page.waitForFunction(() => document.querySelector('#status').className === 'error');
    assert.match(await page.locator('#status').textContent(), /Проект не найден/);
    await page.route('**/assets/sales/after.jpg', route => route.abort());
    await page.goto(base + '/repo/');
    await page.waitForFunction(() => document.querySelector('#status').className === 'error');
    assert.match(await page.locator('#status').textContent(), /Не удалось загрузить/);
    await page.unroute('**/assets/sales/after.jpg');
    await page.route('**/assets/sales/after.jpg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>' }));
    await page.goto(base + '/repo/');
    await page.waitForFunction(() => document.querySelector('#status').className === 'error');
    assert.match(await page.locator('#status').textContent(), /Пропорции/);
    await page.unroute('**/assets/sales/after.jpg');
    await page.goto(base + '/host');
    const frame = page.frames().find(frame => frame.url().includes('/repo/'));
    await frame.locator('#comparison').waitFor({ state: 'visible' });
    const box = await frame.locator('#comparison').boundingBox();
    assert(box.height <= 300 && box.width <= 375);
    await frame.locator('#slider').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await frame.locator('#slider').inputValue(), '49');
    assert.deepEqual(errors, []);
    console.log('PASS: local assets, repository subpath, keyboard, mouse capture, touch, mobile proportions, project selection, errors and iframe.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
