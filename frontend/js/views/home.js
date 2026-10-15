import { api } from "../api.js";
import { user } from "../user.js";
import { el, errorBox, metaLine, row, skeletonRow } from "../ui.js";

export async function renderHome(view) {
  view.replaceChildren(el("div", { class: "hero skeleton" }), skeletonRow("Top picks for you"), skeletonRow("Popular"));

  try {
    const rated = new Set(user.ratings.keys());
    const unrated = (list) => list.filter((m) => !rated.has(m.id));
    const loved = user.loved().slice(0, 3);

    const [picks, popular, ...similarLists] = await Promise.all([
      api.recommendations(user.id, 30),
      api.popular(40),
      ...loved.map((m) => api.similar(m.id, 20)),
    ]);
    const personal = picks.some((m) => m.because);
    const top = picks[0] ?? popular[0];
    const heroMovie = top ? await api.movie(top.id) : null;

    // Each movie appears in at most one row, so rows don't repeat each other.
    const shown = new Set();
    const fresh = (list) => unrated(list).filter((m) => !shown.has(m.id));
    const rows = [];
    const addRow = (title, list, options) => {
      if (list.length < 4) return;
      list.forEach((m) => shown.add(m.id));
      rows.push(row(title, list, options));
    };
    if (personal) addRow("Top picks for you", picks.slice(0, 12), { caption: (m) => `Because you liked ${m.because}` });
    loved.forEach((m, i) => addRow(`Because you liked ${m.title}`, fresh(similarLists[i])));
    addRow("Popular on Movie Picks", fresh(popular));
    if (!personal) {
      rows.unshift(
        el("p", { class: "nudge" }, "Rate a few movies you liked to get picks made for you. ",
          el("a", { href: "#/welcome" }, "Pick movies you love"))
      );
    }

    view.replaceChildren(heroMovie ? hero(heroMovie, personal ? top.because : null) : "", ...rows);
  } catch (error) {
    view.replaceChildren(errorBox(`Couldn't load your picks. ${error.message}`, () => renderHome(view)));
  }
}

function hero(movie, because) {
  return el(
    "section",
    { class: "hero", dataset: { genre: movie.genres?.[0] || "" } },
    movie.backdrop && el("img", { class: "hero-backdrop", src: movie.backdrop, alt: "", onerror: (e) => e.target.remove() }),
    el(
      "div",
      { class: "hero-body" },
      el("p", { class: "hero-kicker" }, because ? `Your top pick, because you liked ${because}` : "Most loved on Movie Picks"),
      el("h1", { class: "hero-title" }, movie.title),
      el("p", { class: "hero-meta" }, metaLine(movie)),
      el("p", { class: "hero-text" }, movie.tagline || movie.overview || ""),
      el("a", { class: "btn primary", href: `#/movie/${movie.id}` }, "View details")
    )
  );
}
