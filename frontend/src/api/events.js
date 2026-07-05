import { getBlob, getJson } from "./client.js";

function params(query = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const getEvents = (query = {}) => getJson(`/events${params(query)}`);
export const getEvent = (id) => getJson(`/events/${id}`);
export const getEventSnapshot = (id) => getBlob(`/events/${id}/snapshot`);
