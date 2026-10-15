import { rateMovie, removeRating } from "../actions.js";
import { go } from "../router.js";
import { user } from "../user.js";
import { el, grid, stars } from "../ui.js";

export function renderRatings(view) {
  const movies = [...user.ratings.values()].sort((a, b) => b.rating - a.rating);
  const startOver = el("button", {
    type: "button",
    class: "btn ghost small",
    onclick: () => {
      if (confirm("Start over with a fresh profile? Your current ratings will no longer be used.")) {
        user.startOver();
        go("#/welcome");
      }
    },
  }, "Start over");

  const body = movies.length
    ? grid(movies, {
        extra: (m) =>
          el(
            "div",
            { class: "grid-controls" },
            stars(m.rating, (n) => rateMovie(m, n), { label: `Your rating for ${m.title}` }),
            el("button", {
              type: "button",
              class: "link-btn",
              onclick: async () => {
                if (await removeRating(m)) renderRatings(view);
              },
            }, "Remove")
          ),
      })
    : el("div", { class: "empty" },
        el("p", {}, "You haven't rated any movies yet."),
        el("a", { class: "btn primary", href: "#/welcome" }, "Pick movies you love"));

  view.replaceChildren(
    el(
      "section",
      { class: "page" },
      el("div", { class: "page-head" },
        el("h1", { class: "page-title" }, "Your ratings"),
        movies.length ? startOver : ""),
      movies.length ? el("p", { class: "lede" }, `${movies.length} movie${movies.length > 1 ? "s" : ""} rated. Change a rating any time; your picks follow.`) : "",
      body
    )
  );
}
