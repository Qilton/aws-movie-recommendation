// Thin wrapper around the backend API. window.API_BASE comes from config.js.

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch((window.API_BASE || "") + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error("Can't reach the server. Check that it's running and try again.");
  }
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.detail === "string" ? body.detail : `The server rejected the request (${response.status}).`);
  }
  return body;
}

const q = encodeURIComponent;

export const api = {
  popular: (limit = 40) => request(`/api/movies/popular?limit=${limit}`),
  search: (text, limit = 48) => request(`/api/movies/search?q=${q(text)}&limit=${limit}`),
  movie: (id) => request(`/api/movies/${id}`),
  similar: (id, limit = 20) => request(`/api/movies/${id}/similar?limit=${limit}`),
  ratings: (user) => request(`/api/users/${user}/ratings`),
  recommendations: (user, limit = 30) => request(`/api/users/${user}/recommendations?limit=${limit}`),
  rate: (user, id, rating) =>
    request(`/api/users/${user}/ratings/${id}`, { method: "PUT", body: JSON.stringify({ rating }) }),
  unrate: (user, id) => request(`/api/users/${user}/ratings/${id}`, { method: "DELETE" }),
};
