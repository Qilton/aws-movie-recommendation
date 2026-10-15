const api = (path, options) =>
  fetch(window.API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof body.detail === "string" ? body.detail : "Request rejected by the server.";
      throw new Error(detail);
    }
    return body;
  });

const $ = (id) => document.getElementById(id);
const state = { user: null, ratings: new Map() };

function setStatus(message, isError = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", isError);
}

function tile(movie, reason) {
  const node = $("tile").content.firstElementChild.cloneNode(true);
  const poster = node.querySelector(".poster");
  poster.dataset.genre = movie.genres[0] || "";
  poster.setAttribute("aria-label", `More like ${movie.title}`);
  poster.addEventListener("click", () => showSimilar(movie));
  node.querySelector(".poster-title").textContent = movie.title;
  node.querySelector(".poster-year").textContent = movie.year ?? "";
  node.querySelector(".reason").textContent = reason ?? movie.genres.slice(0, 2).join(", ");

  const stars = node.querySelector(".stars");
  stars.setAttribute("aria-label", `Rate ${movie.title}`);
  const current = state.ratings.get(movie.id)?.rating ?? 0;
  for (let n = 1; n <= 5; n++) {
    const star = document.createElement("button");
    star.type = "button";
    star.textContent = "★";
    star.setAttribute("aria-label", `${n} star${n > 1 ? "s" : ""}`);
    star.setAttribute("aria-pressed", String(n <= current));
    star.classList.toggle("on", n <= current);
    star.addEventListener("click", () => rate(movie, n, node));
    stars.append(star);
  }
  return node;
}

function fill(container, movies, reasonOf) {
  container.replaceChildren(...movies.map((m) => tile(m, reasonOf?.(m))));
}

async function rate(movie, rating, node) {
  if (!state.user) {
    setStatus("Enter your name first, so your ratings can be saved.", true);
    $("name").focus();
    return;
  }
  try {
    await api(`/api/users/${state.user}/ratings/${movie.id}`, {
      method: "PUT",
      body: JSON.stringify({ rating }),
    });
    state.ratings.set(movie.id, { ...movie, rating });
    node.querySelectorAll(".stars button").forEach((b, i) => {
      b.classList.toggle("on", i < rating);
      b.setAttribute("aria-pressed", String(i < rating));
    });
    node.classList.remove("rated");
    void node.offsetWidth; // restart the confirmation animation
    node.classList.add("rated");
    setStatus(`Rated ${movie.title} ${rating}/5.`);
    renderRatings();
    await loadRecommendations();
  } catch (error) {
    setStatus(`Couldn't save rating: ${error.message}`, true);
  }
}

function renderRatings() {
  const items = [...state.ratings.values()].sort((a, b) => b.rating - a.rating);
  $("ratings").replaceChildren(
    ...items.map((m) => {
      const li = document.createElement("li");
      const title = document.createElement("span");
      title.textContent = m.title;
      const stars = document.createElement("span");
      stars.className = "r";
      stars.textContent = "★".repeat(Math.round(m.rating));
      stars.setAttribute("aria-label", `${m.rating} stars`);
      li.append(title, stars);
      return li;
    })
  );
  $("ratings-empty").hidden = items.length > 0;
}

async function loadRecommendations() {
  try {
    if (!state.user) {
      fill($("recs"), await api("/api/movies/popular?limit=12"));
      return;
    }
    const recs = await api(`/api/users/${state.user}/recommendations?limit=18`);
    const personal = recs.some((m) => m.because);
    $("recs-title").textContent = personal ? "Picked for you" : "Popular right now";
    $("recs-hint").textContent = personal
      ? "Based on what you rated. Rate more to sharpen them."
      : "Rate a few movies you liked (4 or 5 stars) to get personal picks.";
    fill($("recs"), recs, (m) => (m.because ? `Because you liked ${m.because}` : null));
  } catch (error) {
    setStatus(`Couldn't load recommendations: ${error.message}`, true);
  }
}

async function showSimilar(movie) {
  try {
    const similar = await api(`/api/movies/${movie.id}/similar?limit=12`);
    $("similar-title").textContent = `More like ${movie.title}`;
    fill($("similar"), similar);
    $("similar-block").hidden = false;
    $("similar-block").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    setStatus(`Couldn't load similar movies: ${error.message}`, true);
  }
}

let searchTimer;
$("q").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  const q = event.target.value.trim();
  if (!q) {
    $("results-block").hidden = true;
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const results = await api(`/api/movies/search?q=${encodeURIComponent(q)}&limit=20`);
      fill($("results"), results);
      $("results-block").hidden = false;
      setStatus(results.length ? "" : `No movies match "${q}". Try part of the title.`);
    } catch (error) {
      setStatus(`Search failed: ${error.message}`, true);
    }
  }, 250);
});

$("close-similar").addEventListener("click", () => ($("similar-block").hidden = true));

$("who").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("name").value.trim();
  state.user = name;
  try { localStorage.setItem("movie-picks-user", name); } catch {}
  $("q").disabled = false;
  $("q").focus();
  try {
    const rated = await api(`/api/users/${name}/ratings`);
    state.ratings = new Map(rated.map((m) => [m.id, m]));
    setStatus(rated.length ? `Welcome back, ${name}.` : `Hi ${name}. Search for a movie you've seen and rate it.`);
  } catch (error) {
    state.ratings = new Map();
    setStatus(`Couldn't load your ratings: ${error.message}`, true);
  }
  renderRatings();
  loadRecommendations();
});

(function init() {
  let saved = null;
  try { saved = localStorage.getItem("movie-picks-user"); } catch {}
  renderRatings();
  if (saved) {
    $("name").value = saved;
    $("who").requestSubmit();
  } else {
    loadRecommendations();
  }
})();
