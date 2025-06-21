const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');

const inputUrl = process.argv[2];
const timeoutMin = parseInt(process.argv[3] || '5');

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:110.0) Gecko/20100101 Firefox/110.0',
  'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Mobile Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function normalizeUrl(input) {
  let url = input.trim();
  if (!url.startsWith('http')) url = 'https://' + url;
  url = url.split('#')[0];
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function extractDomain(url) {
  const { hostname } = new URL(url);
  return hostname.replace(/^www\./, '');
}

// 🔁 NEW: Resolve final URL after all redirects
async function resolveFinalUrl(input) {
  try {
    const res = await axios.get(normalizeUrl(input), {
      maxRedirects: 5,
      timeout: 10000,
      headers: { 'User-Agent': getRandomUserAgent() },
    });
    return res.request.res.responseUrl || normalizeUrl(input);
  } catch (err) {
    return normalizeUrl(input);
  }
}

async function extractEmails(html) {
  const emails = html.match(EMAIL_REGEX);
  if (!emails) return [];
  return emails.filter(email => {
    const lower = email.toLowerCase();
    return (
      !lower.endsWith('.png') &&
      !lower.endsWith('.jpg') &&
      !lower.endsWith('.jpeg') &&
      !lower.endsWith('.svg') &&
      !lower.endsWith('.webp') &&
      !lower.endsWith('.html') &&
      !lower.endsWith('.htm') &&
      !lower.endsWith('.php') &&
      !lower.includes('@sentry.') &&
      !lower.includes('@google') &&
      !lower.includes('@2x.') &&
      !lower.includes('@1x.webp') &&
      !lower.includes('@-') &&
      (lower.match(/@/g) || []).length === 1 // ensure exactly one "@"
    );
  });
}

async function scrapeWithCheerio(url) {
  try {
    const userAgent = getRandomUserAgent();
    const { data: html } = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': userAgent
      }
    });
    const $ = cheerio.load(html);
    return await extractEmails($.html());
  } catch (err) {
    return null;
  }
}

async function scrapeWithPlaywright(url) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: getRandomUserAgent() });
  const page = await context.newPage();

  await page.route('**/*', (route) => {
    const req = route.request();
    if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
      route.abort();
    } else {
      route.continue();
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000); // give extra time for JS rendering
// Handle modals/popups like cookie consent or age gates
try {
  // Try standard clicks first
  await Promise.race([
    page.click('text="Accept All"', { timeout: 3000 }).catch(() => {}),
    page.click('text="I Agree"', { timeout: 3000 }).catch(() => {}),
    page.click('text="Yes, I am 18+"', { timeout: 3000 }).catch(() => {}),
    page.click('text="Continue to site"', { timeout: 3000 }).catch(() => {}),
    page.click('text="Proceed"', { timeout: 3000 }).catch(() => {}),
    page.click('button:has-text("Accept")', { timeout: 3000 }).catch(() => {}),
    page.click('button:has-text("OK")', { timeout: 3000 }).catch(() => {}),
    page.click('button:has-text("Enter")', { timeout: 3000 }).catch(() => {}),
  ]);

  // Try clicking buttons inside Shadow DOMs
  await page.evaluate(() => {
    const tryShadowClick = (selector) => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          const btn = el.shadowRoot.querySelector(selector);
          if (btn) btn.click();
        }
      }
    };
    tryShadowClick('button#acceptAll');
    tryShadowClick('button:contains("Accept")');
    tryShadowClick('button:contains("OK")');
  });

  // Try clicking inside iframes
  for (const frame of page.frames()) {
    try {
      const btn = await frame.waitForSelector('text="Accept All"', { timeout: 2000 });
      if (btn) await btn.click();
    } catch {}
    try {
      const btn2 = await frame.waitForSelector('text="I am 18+"', { timeout: 2000 });
      if (btn2) await btn2.click();
    } catch {}
  }
} catch (e) {
  // Ignore any failures, it's best-effort
}

    const html = await page.content();
    return await extractEmails(html);
  } catch {
    return [];
  } finally {
    await browser.close();
  }
}

async function hybridScrape(url) {
  const cheerioEmails = await scrapeWithCheerio(url);
  if (cheerioEmails && cheerioEmails.length > 0) return cheerioEmails;
  return await scrapeWithPlaywright(url);
}

// 🔁 Rotating search engine logic
let engineIndex = 0;

async function searchEngineScrape(domain) {
  const queries = [
    `"@${domain}" site:${domain}`,
    `"email" site:${domain}`,
    `"contact" site:${domain}`
  ];

  const engines = [
    { name: 'google', url: q => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    { name: 'bing', url: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
    { name: 'duckduckgo', url: q => `https://html.duckduckgo.com/html?q=${encodeURIComponent(q)}` }
  ];

  const engineOrder = [
    engines[engineIndex % engines.length],
    engines[(engineIndex + 1) % engines.length],
    engines[(engineIndex + 2) % engines.length]
  ];

  engineIndex++;

  const results = new Set();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: getRandomUserAgent() });
  const page = await context.newPage();

  await page.route('**/*', route => {
    if (["image", "stylesheet", "font"].includes(route.request().resourceType())) {
      return route.abort();
    }
    route.continue();
  });

  for (const engine of engineOrder) {
    let success = false;

    for (const query of queries) {
      try {
        await page.goto(engine.url(query), { waitUntil: 'domcontentloaded', timeout: 20000 });

        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a'))
            .map(a => a.href)
            .filter(href => href.startsWith('http'))
        );

        for (const link of links) {
          try {
            const normalized = normalizeUrl(link);
            const emails = await hybridScrape(normalized);
            for (const email of emails) {
              if (!results.has(email)) {
                results.add(email);
                console.log(email);
              }
            }
          } catch {}
        }

        success = true;
      } catch (e) {
        console.warn(`⚠️ ${engine.name} failed: ${e.message}`);
      }
    }

    if (success) break;
  }

  await browser.close();
}

(async () => {
  if (!inputUrl) {
    console.error('No URL provided');
    process.exit(1);
  }

  // 🔁 Get final resolved landing page
  const startUrl = await resolveFinalUrl(inputUrl);

  const domain = extractDomain(startUrl);
  const visited = new Set();
  const emails = new Set();
  const queue = [startUrl];
  const MAX_CONCURRENT_PAGES = 10;
  const TIMEOUT_MS = timeoutMin * 60 * 1000;

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
  }, TIMEOUT_MS);

  const hybridEmails = await hybridScrape(startUrl);
  if (hybridEmails && hybridEmails.length > 0) {
    for (const email of hybridEmails) {
      if (!emails.has(email)) {
        emails.add(email);
        console.log(email);
      }
    }
  }

  const browser = await chromium.launch({ headless: true });
  let activeCount = 0;
  let queueIndex = 0;

  async function scrapePage(url) {
    if (visited.has(url) || timedOut) return;
    visited.add(url);

    const context = await browser.newContext({ userAgent: getRandomUserAgent() });
    const page = await context.newPage();

    await page.route('**/*', (route) => {
      const req = route.request();
      if (["image", "stylesheet", "font"].includes(req.resourceType())) {
        route.abort();
      } else {
        route.continue();
      }
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const html = await page.content();
      const foundEmails = await extractEmails(html);
      if (foundEmails) {
        for (const email of foundEmails) {
          if (!emails.has(email)) {
            emails.add(email);
            console.log(email);
          }
        }
      }

      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a')).map(a => a.href)
      );

      for (let link of links) {
        try {
          const normalized = normalizeUrl(link);
          if (
            extractDomain(normalized) === domain &&
            !visited.has(normalized) &&
            normalized.startsWith('http')
          ) {
            if (/contact|about|team/i.test(normalized)) {
              queue.unshift(normalized);
            } else {
              queue.push(normalized);
            }
          }
        } catch {}
      }
    } catch (err) {
      console.warn(`❌ ${url} failed: ${err.message}`);
    } finally {
      await page.close();
      await context.close();
    }
  }

  async function runQueue() {
    while ((queueIndex < queue.length || activeCount > 0) && !timedOut) {
      while (activeCount < MAX_CONCURRENT_PAGES && queueIndex < queue.length && !timedOut) {
        const urlToScrape = queue[queueIndex++];
        activeCount++;
        scrapePage(urlToScrape).finally(() => activeCount--);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  await runQueue();
  await browser.close();
  clearTimeout(timeoutId);

  await searchEngineScrape(domain);
  process.exit(0);
})();
