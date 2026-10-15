import { currentRoute, go } from "./router.js";
import { user } from "./user.js";
import { errorBox } from "./ui.js";
import { renderHome } from "./views/home.js";
import { renderMovie } from "./views/movie.js";
import { renderRatings } from "./views/ratings.js";
import { renderSearch } from "./views/search.js";
import { renderWelcome } from "./views/welcome.js";

const main = document.getElementById("view");
const searchInput = document.getElementById("search-input");
const countBadge = document.getElementById("rated-count");

user.subscribe(() => {
  countBadge.textContent = user.ratings.size;
  countBadge.hidden = user.ratings.size === 0;
});

async function render() {
  const route = currentRoute();
  // Each render draws into a fresh container, so a slow response for a page
  // the visitor already left lands in a detached node instead of the screen.
  const view = document.createElement("div");
  main.replaceChildren(view);
  if (!user.loaded) {
    try {
      await user.load();
    } catch (error) {
      view.replaceChildren(errorBox(`Couldn't load your ratings. ${error.message}`, render));
      return;
    }
  }
  if (route.name === "home" && user.needsWelcome()) return go("#/welcome", { replace: true });

  document.body.classList.remove("bare");
  document.title = "Movie Picks";
  if (route.name !== "search") searchInput.value = "";
  if (route.name !== "search") window.scrollTo(0, 0);

  switch (route.name) {
    case "welcome": return renderWelcome(view);
    case "movie": return renderMovie(view, route.id);
    case "search": return renderSearch(view, route.params.get("q")?.trim() || "");
    case "ratings": return renderRatings(view);
    case "home": return renderHome(view);
    default: return go("#/", { replace: true });
  }
}

let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = searchInput.value.trim();
    const hash = q ? `#/search?q=${encodeURIComponent(q)}` : "#/";
    // While already on search, replace the history entry instead of adding one per keystroke.
    go(hash, { replace: currentRoute().name === "search" });
  }, 250);
});
document.getElementById("search-form").addEventListener("submit", (e) => e.preventDefault());

window.addEventListener("hashchange", render);
render();
