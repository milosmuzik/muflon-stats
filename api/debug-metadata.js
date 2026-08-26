const STREAM_ID = process.env.ZENO_STREAM_ID || 'wjj5yshttnitv';
const METADATA_URL = `https://api.zeno.fm/mounts/metadata/subscribe/${STREAM_ID}`;

export default async function handler(req, res) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(METADATA_URL, { signal: controller.signal });
    const headers = Object.fromEntries(response.headers.entries());

    if (!response.body) {
      clearTimeout(timeout);
      return res.status(200).json({ status: response.status, headers, raw: null, note: 'no response body' });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      if (raw.length > 2000) break;
    }
    reader.cancel().catch(() => {});
    clearTimeout(timeout);
    return res.status(200).json({ status: response.status, headers, raw: raw.slice(0, 2000) });
  } catch (e) {
    clearTimeout(timeout);
    return res.status(200).json({ error: e.message });
  }
}
