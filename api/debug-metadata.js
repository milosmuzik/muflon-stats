export default async function handler(req, res) {
  const STREAM_ID = process.env.ZENO_STREAM_ID || 'wjj5yshttnitv';
  const METADATA_URL = `https://api.zeno.fm/mounts/metadata/subscribe/${STREAM_ID}`;
  const t0 = Date.now();
  const timeline = [];
  const mark = (label) => timeline.push(`${label}: +${Date.now() - t0}ms`);
  let raw = '';
  let status = null;
  let headers = null;
  let errorMsg = null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    mark('starting fetch');
    const response = await fetch(METADATA_URL, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    });
    status = response.status;
    headers = Object.fromEntries(response.headers.entries());
    mark(`got response, status ${status}`);

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        for (let i = 0; i < 6; i++) {
          const { value, done } = await reader.read();
          mark(`chunk ${i}: done=${done} bytes=${value ? value.length : 0}`);
          if (done) break;
          raw += decoder.decode(value, { stream: true });
          if (raw.length > 3000) break;
        }
      } catch (readErr) {
        mark(`read error: ${readErr.message}`);
      }
      reader.cancel().catch(() => {});
    }
  } catch (e) {
    mark(`fetch error: ${e.message}`);
    errorMsg = e.message;
  } finally {
    clearTimeout(timeout);
  }

  return res.status(200).json({ timeline, status, headers, raw, error: errorMsg });
}
