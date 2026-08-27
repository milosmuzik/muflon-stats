// Rádio mezi skladby vkládá reklamní znělky, kde Zeno posílá jako
// "artist"/"title" webovou adresu inzerenta (např. "www.sapho.cz - SAPHO").
// Takové záznamy nejsou skutečné skladby a do statistik nepatří.
const AD_URL_PATTERN = /^(https?:\/\/)?(www\.)?[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i;

export function looksLikeAd(text) {
  return AD_URL_PATTERN.test((text || '').trim());
}
