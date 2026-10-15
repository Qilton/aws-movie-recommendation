// The anonymous visitor: a random id kept in localStorage, plus their ratings.
import { api } from "./api.js";

const ID_KEY = "movie-picks-user";
const SKIP_KEY = "movie-picks-skipped-welcome";

function storage(action, key, value) {
  try {
    if (action === "get") return localStorage.getItem(key);
    if (action === "set") localStorage.setItem(key, value);
    if (action === "remove") localStorage.removeItem(key);
  } catch {
    return null; // private mode / blocked storage: works for this visit only
  }
}

// crypto.randomUUID needs HTTPS; S3 websites are plain HTTP, so build one ourselves.
function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const listeners = new Set();
export const user = {
  id: storage("get", ID_KEY) || newId(),
  ratings: new Map(), // movie id -> movie summary + rating
  loaded: false,

  async load() {
    storage("set", ID_KEY, this.id);
    const rated = await api.ratings(this.id);
    this.ratings = new Map(rated.map((m) => [m.id, m]));
    this.loaded = true;
    emit();
  },

  ratingOf(id) {
    return this.ratings.get(id)?.rating ?? 0;
  },

  loved() {
    return [...this.ratings.values()].filter((m) => m.rating >= 4).sort((a, b) => b.rating - a.rating);
  },

  needsWelcome() {
    return this.loved().length < 3 && storage("get", SKIP_KEY) !== "1";
  },

  skipWelcome() {
    storage("set", SKIP_KEY, "1");
  },

  async rate(movie, rating) {
    await api.rate(this.id, movie.id, rating);
    this.ratings.set(movie.id, { ...movie, rating });
    emit();
  },

  async unrate(movie) {
    await api.unrate(this.id, movie.id);
    this.ratings.delete(movie.id);
    emit();
  },

  startOver() {
    this.id = newId();
    this.ratings = new Map();
    storage("set", ID_KEY, this.id);
    storage("remove", SKIP_KEY);
    emit();
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function emit() {
  listeners.forEach((fn) => fn(user));
}
