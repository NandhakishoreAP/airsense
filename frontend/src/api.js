export const API_BASE_URL = 'http://localhost:8000';
const responseCache = new Map();
const CACHE_MS = 30_000;

/**
 * Helper to handle fetch responses and throw errors on failure.
 */
async function handleResponse(response) {
  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || JSON.stringify(errJson);
    } catch {
      errorDetail = response.statusText || String(response.status);
    }
    throw new Error(`API Error: ${response.status} - ${errorDetail}`);
  }
  return response.json();
}

async function cachedGet(url, forceRefresh = false) {
  const cached = responseCache.get(url);
  if (!forceRefresh && cached?.value && Date.now() - cached.at < CACHE_MS) return cached.value;
  if (!forceRefresh && cached?.promise) return cached.promise;
  const promise = fetch(url).then(handleResponse).then((value) => {
    responseCache.set(url, { value, at: Date.now() });
    return value;
  });
  responseCache.set(url, { promise, at: Date.now() });
  return promise;
}

/**
 * Fetch current AQI for a city.
 */
export async function getAqiCurrent(city) {
  const url = `${API_BASE_URL}/api/aqi/current?city=${encodeURIComponent(city)}`;
  return cachedGet(url);
}

/**
 * Fetch AQI forecast for a city at a specific horizon hour (24, 48, 72).
 */
export async function getAqiForecast(city, horizonHours = 24) {
  const url = `${API_BASE_URL}/api/aqi/forecast?city=${encodeURIComponent(city)}&horizon_hours=${horizonHours}`;
  return cachedGet(url);
}

/**
 * Fetch current weather conditions for a city.
 */
export async function getWeatherCurrent(city) {
  const url = `${API_BASE_URL}/api/weather/current?city=${encodeURIComponent(city)}`;
  return cachedGet(url);
}

/**
 * Fetch vulnerable sites (schools, hospitals) for a city.
 */
export async function getVulnerableSites(city) {
  const url = `${API_BASE_URL}/api/vulnerable-sites?city=${encodeURIComponent(city)}`;
  const payload = await cachedGet(url);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.sites)) return payload.sites;
  if (Array.isArray(payload?.data)) return payload.data;
  console.error('Unexpected vulnerable-sites response shape:', payload);
  throw new Error('Invalid vulnerable-sites response');
}

/**
 * Fetch multilingual health advisory.
 */
export async function getAdvisory(city, language = 'English') {
  const url = `${API_BASE_URL}/api/advisory?city=${encodeURIComponent(city)}&language=${encodeURIComponent(language)}`;
  const response = await fetch(url);
  return handleResponse(response);
}

/**
 * Fetch source attribution analysis for a city.
 */
export async function getAttribution(city) {
  const url = `${API_BASE_URL}/api/attribution?city=${encodeURIComponent(city)}`;
  const response = await fetch(url);
  return handleResponse(response);
}

/**
 * Post a Q&A question to the citizen chatbot for a city.
 */
export async function postChat(question, city) {
  const url = `${API_BASE_URL}/api/chat`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, city }),
  });
  return handleResponse(response);
}
