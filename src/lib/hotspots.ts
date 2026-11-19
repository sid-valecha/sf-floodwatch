import type { Hotspot } from "./types";

// Hand-placed coastal hotspots: bay/king-tide overtopping that the SFPUC storm model doesn't cover.
export const HOTSPOTS: Hotspot[] = [
  { name: "Embarcadero", lng: -122.3937, lat: 37.7955, why: "Seawall overtopping at high tide + storm surge" },
  { name: "Fisherman's Wharf", lng: -122.4177, lat: 37.808, why: "Low waterfront, king-tide flooding" },
  { name: "Marina Green", lng: -122.44, lat: 37.8065, why: "Wave run-up and ponding on low fill" },
  { name: "Crissy Field", lng: -122.465, lat: 37.804, why: "Tidal marsh edge, coastal overwash" },
  { name: "Islais Creek / Dogpatch", lng: -122.388, lat: 37.7465, why: "Tidal creek backs up into low streets" },
];
