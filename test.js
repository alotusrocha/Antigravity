fetch('https://ytkudhablxwfdupawcyc.supabase.co/functions/v1/chat-agent', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sb_publishable_gKqhUI4Tx28AfPmx1A7Pdw_Uv6xnl4F',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ prompt: 'teste' })
}).then(async r => console.log(r.status, await r.text()));
