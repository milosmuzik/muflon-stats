import { Redis } from '@upstash/redis';

let client = null;

// Vercel/Upstash integrace může proměnné pojmenovat různě podle toho, jak
// byla databáze připojena - zkoušíme běžné varianty, ať appka funguje bez
// ohledu na přesný název proměnných v nastavení projektu.
function resolveCredentials() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Redis přihlašovací údaje nejsou v prostředí nastavené (zkoušeny KV_REST_API_URL/TOKEN a UPSTASH_REDIS_REST_URL/TOKEN).'
    );
  }
  return { url, token };
}

// Klient se vytváří jen jednou na běžící serverless instanci a znovupoužívá
// napříč voláními - ne nové spojení při každém requestu.
export default function getRedis() {
  if (!client) {
    const { url, token } = resolveCredentials();
    client = new Redis({ url, token });
  }
  return client;
}
