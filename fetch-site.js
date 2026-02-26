const https = require('https');

const options = {
  hostname: 'siteser.com.br',
  path: '/um/',
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    // Strip HTML
    const text = data.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    console.log(text.substring(0, 1500));
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.end();
