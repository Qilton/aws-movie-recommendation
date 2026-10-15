// Rating actions with user feedback. Return false on failure so callers can roll back.
import { user } from "./user.js";
import { toast } from "./ui.js";

export async function rateMovie(movie, rating) {
  try {
    await user.rate(movie, rating);
    toast(`Rated ${movie.title} ${rating}/5. Your picks are updated.`);
    return true;
  } catch (error) {
    toast(`Couldn't save your rating. ${error.message}`);
    return false;
  }
}

export async function removeRating(movie) {
  try {
    await user.unrate(movie);
    toast(`Removed your rating for ${movie.title}.`);
    return true;
  } catch (error) {
    toast(`Couldn't remove the rating. ${error.message}`);
    return false;
  }
}
