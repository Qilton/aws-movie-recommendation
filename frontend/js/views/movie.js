import { api } from "../api.js";
import { rateMovie, removeRating } from "../actions.js";
import { user } from "../user.js";
import { el, errorBox, metaLine, poster, row, skeletonRow, stars } from "../ui.js";

export async function renderMovie(view, id) {
  view.replaceChildren(el("div", { class: "movie-banner skeleton" }), skeletonRow("More like this"));

  let movie, similar;
  try {
    [movie, similar] = await Promise.all([api.movie(id), api.similar(id, 20)]);
  } catch (error) {
    const message = error.message.startsWith("Unknown movie") ? "We couldn't find that movie." : `Couldn't load this movie. ${error.message}`;
    view.replaceChildren(errorBox(message, () => renderMovie(view, id)));
    return;
  }
  document.title = `${movie.title} · Movie Picks`;

  const yourLabel = el("p", { class: "your-label" });
  const remove = el("button", { type: "button", class: "btn ghost small" }, "Remove rating");
  const starGroup = stars(user.ratingOf(movie.id), async (n) => {
    const ok = await rateMovie(movie, n);
    if (ok) refresh();
    return ok;
  }, { label: `Your rating for ${movie.title}`, large: true });
  remove.addEventListener("click", async () => {
    if (await removeRating(movie)) {
      starGroup.setValue(0);
      refresh();
    }
  });
  const refresh = () => {
    const r = user.ratingOf(movie.id);
    yourLabel.textContent = r ? `You rated it ${r}/5` : "Seen it? Rate it to improve your picks.";
    remove.hidden = !r;
  };
  refresh();

  const facts = [
    movie.director && ["Directed by", movie.director],
    movie.cast.length && ["Starring", movie.cast.join(", ")],
    movie.avg && ["MovieLens users", `${movie.avg} out of 5 from ${movie.count.toLocaleString()} ratings`],
  ].filter(Boolean);

  view.replaceChildren(
    el(
      "article",
      { class: "movie" },
      el(
        "div",
        { class: "movie-banner", dataset: { genre: movie.genres?.[0] || "" } },
        movie.backdrop && el("img", { src: movie.backdrop, alt: "", onerror: (e) => e.target.remove() })
      ),
      el(
        "div",
        { class: "movie-main" },
        el("div", { class: "movie-poster" }, poster(movie)),
        el(
          "div",
          { class: "movie-info" },
          el("h1", {}, movie.title),
          el("p", { class: "movie-meta" }, metaLine(movie)),
          movie.tagline && el("p", { class: "movie-tagline" }, movie.tagline),
          el("p", { class: "movie-overview" }, movie.overview || "No plot summary available for this movie yet."),
          facts.length && el("dl", { class: "facts" }, facts.map(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
          el("section", { class: "your-rating", "aria-label": "Your rating" }, el("h2", {}, "Your rating"), starGroup, yourLabel, remove)
        )
      )
    ),
    similar.length ? row("More like this", similar) : ""
  );
}
