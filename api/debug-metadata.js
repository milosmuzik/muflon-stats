export default async function handler(req, res) {
  const STREAM_ID = process.env.ZENO_STREAM_ID || 'wjj5yshttnitv';
  const METADATA_URL = `https://api.zeno.fm/mounts/metadata/subscribe/${STREAM_ID}`;
  const t0 = Date.now();
  const timeline = [];
  const mark = (label) => timeline.push(`${label}: +${Date.now() - t0}ms`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    mark('starting fetch');
    const response = await fetch(METADATA_URL, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    });
    mark(`got response, status ${response.status}`);
    const headers = Object.fromEntries(response.headers.entries());

    if (!response.body) {
      clearTimeout(timeout);
      return res.status(200).json({ timeline, status: response.status, headers, raw: null });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      mark(`chunk ${i}: done=${done} bytes=${value ? value.length : 0}`);
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      if (raw.length > 2000) break;
    }
    reader.cancel().catch(() => {});
    clearTimeout(timeout);
    return res.status(200).json({ timeline, status: response.status, headers, raw: raw.slice(0, 2000) });
  } catch (e) {
    clearTimeout(timeout);
    mark(`error: ${e.message}`);
    return res.status(200).json({ timeline, error: e.message });
  }
}
