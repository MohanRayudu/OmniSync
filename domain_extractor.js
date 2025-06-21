const { chromium } = require('playwright');

const input = process.argv.slice(2).join(' ');

if (!input) {
  console.error('❌ No company name provided.');
  process.exit(1);
}

function extractDomain(url) {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    return domain;
  } catch {
    return null;
  }
}

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    userAgent: getRandomUserAgent()
  });

  const page = await context.newPage();

  try {
    const query = encodeURIComponent(`${input} official site`);
    const url = `https://www.google.com/search?hl=en&q=${query}`;

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Give extra time for JS-based rendering

    const links = await page.$$eval('a', anchors =>
      anchors
        .map(a => a.href)
        .filter(href =>
          href.startsWith('http') &&
          !href.includes('google.') &&
          !href.includes('/search?') &&
          !href.includes('/settings') &&
          !href.includes('/policies') &&
          !href.includes('/preferences') &&
          !href.includes('accounts.google') &&
          !href.includes('webcache.googleusercontent')
        )
    );

    console.log('🔗 Links found:', links.slice(0, 3));

let cleanDomain = null;

for (const link of links) {
  if (
    !link.includes('linkedin.com') &&
    !link.includes('crunchbase.com') &&
    !link.includes('facebook.com') &&
    !link.includes('twitter.com')
  ) {
    cleanDomain = extractDomain(link);
    break;
  }
}
    if (cleanDomain) {
      console.log(cleanDomain);
    } else {
      console.error(`❌ No valid domain found for: ${input}`);
    }
  } catch (err) {
    console.error(`❌ Failed for "${input}": ${err.message}`);
  } finally {
    await browser.close();
  }
})();
