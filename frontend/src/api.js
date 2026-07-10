export const API_BASE_URL = 'http://localhost:8000';

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

/**
 * Fetch current AQI for a city.
 */
export async function getAqiCurrent(city) {
  const url = `${API_BASE_URL}/api/aqi/current?city=${encodeURIComponent(city)}`;
  const response = await fetch(url);
  return handleResponse(response);
}

/**
 * Fetch AQI forecast for a city at a specific horizon hour (24, 48, 72).
 */
export async function getAqiForecast(city, horizonHours = 24) {
  const url = `${API_BASE_URL}/api/aqi/forecast?city=${encodeURIComponent(city)}&horizon_hours=${horizonHours}`;
  const response = await fetch(url);
  return handleResponse(response);
}

/**
 * Fetch current weather conditions for a city.
 */
export async function getWeatherCurrent(city) {
  const url = `${API_BASE_URL}/api/weather/current?city=${encodeURIComponent(city)}`;
  const response = await fetch(url);
  return handleResponse(response);
}

/**
 * Fetch vulnerable sites (schools, hospitals) for a city.
 */
export async function getVulnerableSites(city) {
  const url = `${API_BASE_URL}/api/vulnerable-sites?city=${encodeURIComponent(city)}`;
  const response = await fetch(url);
  return handleResponse(response);
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
