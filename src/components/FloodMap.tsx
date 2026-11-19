"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { HOTSPOTS } from "@/lib/hotspots";
import { freshnessOpacity } from "@/lib/freshness";
import type { Report } from "@/lib/types";

export type LayerKey = "sfpuc" | "fema" | "hotspots" | "reports" | "radar" | "alerts" | "drains";
export type LayerVisibility = Record<LayerKey, boolean>;

// Map-layer ids grouped by toggle key.
const LAYER_IDS: Record<LayerKey, string[]> = {
  sfpuc: ["sfpuc-fill", "sfpuc-line"],
  fema: ["fema-fill", "fema-line"],
  hotspots: ["hotspots-halo", "hotspots-dot"],
  reports: ["reports-halo", "reports-dot"],
  radar: ["radar"],
  alerts: ["alerts-fill", "alerts-line"],
  drains: ["drains-dot"],
};

// Visual language: MODELED = cyan/blue fills, OFFICIAL = amber, OBSERVED = hot pink pins.
export const COLORS = {
  modeled: "#38bdf8",
  modeledStrong: "#2563eb",
  official: "#f59e0b",
  observed: "#f43f5e",
  news: "#e879f9",
};

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface Props {
  visibility: LayerVisibility;
  reports: Report[];
  radarTileUrl: string | null;
  alertsGeoJSON: GeoJSON.FeatureCollection | null;
  onSelectReport: (r: Report) => void;
  onSelectNeighborhood: (name: string, lngLat: [number, number]) => void;
  selectedNhood?: string | null;
  flyTo?: { lng: number; lat: number; zoom?: number; padBottom?: number; key: number } | null;
}

function reportsToGeoJSON(reports: Report[]): GeoJSON.FeatureCollection {
  const now = Date.now();
  return {
    type: "FeatureCollection",
    features: reports.map((r) => ({
      type: "Feature",
      id: r.id,
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id,
        source: r.source,
        severity: r.severity,
        opacity: freshnessOpacity(r.createdAt, now),
        approximate: r.approximate,
      },
    })),
  };
}

export default function FloodMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const loaded = useRef(false);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [-122.437, 37.765],
      zoom: 11.6,
      minZoom: 10,
      maxBounds: [
        [-122.75, 37.6],
        [-122.25, 37.9],
      ],
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      "bottom-right",
    );

    map.on("load", () => {
      // Insert data layers under the basemap labels so street names stay readable.
      const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

      // Neighborhoods: invisible fill for hit-testing + faint outlines.
      map.addSource("nhoods", { type: "geojson", data: "/data/neighborhoods.geojson" });
      map.addLayer(
        { id: "nhoods-fill", type: "fill", source: "nhoods", paint: { "fill-color": "#000", "fill-opacity": 0 } },
        firstSymbol,
      );
      map.addLayer(
        {
          id: "nhoods-line",
          type: "line",
          source: "nhoods",
          paint: { "line-color": "#94a3b8", "line-opacity": 0.25, "line-width": 0.8 },
        },
        firstSymbol,
      );

      // Selected neighborhood outline (filter set via applyAll).
      map.addLayer({
        id: "nhoods-selected",
        type: "line",
        source: "nhoods",
        filter: ["==", ["get", "nhood"], ""],
        paint: { "line-color": "#ffffff", "line-width": 2 },
      });

      // MODELED: FEMA coastal (bay/ocean) hazard.
      map.addSource("fema", { type: "geojson", data: "/data/fema-flood.geojson" });
      map.addLayer(
        {
          id: "fema-fill",
          type: "fill",
          source: "fema",
          paint: {
            "fill-color": ["match", ["get", "risk"], "high", COLORS.modeledStrong, "#1e3a8a"],
            "fill-opacity": ["match", ["get", "risk"], "high", 0.45, 0.25],
          },
        },
        firstSymbol,
      );
      map.addLayer(
        {
          id: "fema-line",
          type: "line",
          source: "fema",
          paint: { "line-color": COLORS.modeledStrong, "line-width": 0.6, "line-opacity": 0.6 },
        },
        firstSymbol,
      );

      // MODELED: SFPUC 100-year storm runoff risk zone.
      map.addSource("sfpuc", { type: "geojson", data: "/data/sfpuc-100yr.geojson" });
      map.addLayer(
        {
          id: "sfpuc-fill",
          type: "fill",
          source: "sfpuc",
          paint: { "fill-color": COLORS.modeled, "fill-opacity": 0.38 },
        },
        firstSymbol,
      );
      map.addLayer(
        {
          id: "sfpuc-line",
          type: "line",
          source: "sfpuc",
          paint: { "line-color": COLORS.modeled, "line-width": 0.7, "line-opacity": 0.8 },
        },
        firstSymbol,
      );

      // OFFICIAL: NWS alert polygons (filled in later via setData).
      map.addSource("alerts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "alerts-fill",
        type: "fill",
        source: "alerts",
        paint: { "fill-color": COLORS.official, "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "alerts-line",
        type: "line",
        source: "alerts",
        paint: { "line-color": COLORS.official, "line-width": 2, "line-dasharray": [2, 2] },
      });

      // MODELED: coastal hotspots (hand-placed).
      map.addSource("hotspots", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: HOTSPOTS.map((h) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [h.lng, h.lat] },
            properties: { name: h.name, why: h.why },
          })),
        },
      });
      map.addLayer({
        id: "hotspots-halo",
        type: "circle",
        source: "hotspots",
        paint: { "circle-radius": 14, "circle-color": COLORS.modeled, "circle-opacity": 0.15 },
      });
      map.addLayer({
        id: "hotspots-dot",
        type: "circle",
        source: "hotspots",
        paint: {
          "circle-radius": 5,
          "circle-color": "#0f172a",
          "circle-stroke-color": COLORS.modeled,
          "circle-stroke-width": 2,
        },
      });

      // OBSERVED: report pins.
      map.addSource("reports", { type: "geojson", data: reportsToGeoJSON(latest.current.reports) });
      map.addLayer({
        id: "reports-halo",
        type: "circle",
        source: "reports",
        paint: {
          "circle-radius": ["match", ["get", "severity"], "high", 20, "med", 15, 11],
          "circle-color": ["match", ["get", "source"], "news", COLORS.news, COLORS.observed],
          "circle-opacity": ["*", 0.22, ["get", "opacity"]],
          "circle-blur": 0.4,
        },
      });
      map.addLayer({
        id: "reports-dot",
        type: "circle",
        source: "reports",
        paint: {
          "circle-radius": ["match", ["get", "severity"], "high", 8, "med", 7, 6],
          "circle-color": ["match", ["get", "source"], "news", COLORS.news, COLORS.observed],
          "circle-opacity": ["get", "opacity"],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": ["case", ["get", "approximate"], 0.5, 1.5],
          "circle-stroke-opacity": ["get", "opacity"],
        },
      });

      loaded.current = true;
      applyAll(map, latest.current);

      // MODELED: storm drains. Fetched lazily, only once the user zooms in close,
      // so phones don't download it at the city view.
      const addDrains = () => {
        if (map.getSource("drains")) return;
        map.addSource("drains", { type: "geojson", data: "/data/storm-drains.geojson" });
        map.addLayer({
          id: "drains-dot",
          type: "circle",
          source: "drains",
          minzoom: 15,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2, 18, 3],
            "circle-color": COLORS.modeled,
            "circle-opacity": 0.7,
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 0.5,
          },
        });
        applyVisibility(map, latest.current.visibility);
      };
      if (map.getZoom() >= 14.5) addDrains();
      else {
        const onZoom = () => {
          if (map.getZoom() < 14.5) return;
          map.off("zoom", onZoom);
          addDrains();
        };
        map.on("zoom", onZoom);
      }
    });

    // Report pins win over neighborhoods; neighborhoods open the risk card.
    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(
        [
          [e.point.x - 10, e.point.y - 10],
          [e.point.x + 10, e.point.y + 10],
        ],
        { layers: ["reports-dot", "hotspots-dot"].filter((id) => map.getLayer(id)) },
      );
      const rep = hits.find((h) => h.layer.id === "reports-dot");
      if (rep) {
        const r = latest.current.reports.find((x) => x.id === rep.properties.id);
        if (r) return latest.current.onSelectReport(r);
      }
      const hs = hits.find((h) => h.layer.id === "hotspots-dot");
      if (hs) {
        new maplibregl.Popup({ closeButton: false, className: "fw-popup" })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="text-[11px] uppercase tracking-wide text-sky-300">Modeled · coastal hotspot</div><div class="font-semibold">${hs.properties.name}</div><div class="text-slate-300 text-xs">${hs.properties.why}</div>`,
          )
          .addTo(map);
        return;
      }
      const nh = map.queryRenderedFeatures(e.point, { layers: ["nhoods-fill"] })[0];
      if (nh) latest.current.onSelectNeighborhood(nh.properties.nhood, [e.lngLat.lng, e.lngLat.lat]);
    });
    map.on("mousemove", "reports-dot", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "reports-dot", () => (map.getCanvas().style.cursor = ""));

    return () => {
      loaded.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Separate effects so setData only runs when its own input changes.
  const { reports, alertsGeoJSON, radarTileUrl, visibility, selectedNhood } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded.current) applySelected(map, selectedNhood);
  }, [selectedNhood]);
  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded.current) applyReports(map, reports);
  }, [reports]);
  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded.current) applyAlerts(map, alertsGeoJSON);
  }, [alertsGeoJSON]);
  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded.current) {
      applyRadar(map, radarTileUrl);
      applyVisibility(map, visibility);
    }
  }, [radarTileUrl, visibility]);

  useEffect(() => {
    const f = props.flyTo;
    if (f && mapRef.current) mapRef.current.flyTo({
        center: [f.lng, f.lat],
        zoom: f.zoom ?? 15,
        padding: { top: 0, left: 0, right: 0, bottom: f.padBottom ?? 0 },
        essential: true,
      });
  }, [props.flyTo]);

  return <div ref={container} className="absolute inset-0" />;
}

function applyAll(map: MLMap, p: Props) {
  applySelected(map, p.selectedNhood);
  applyReports(map, p.reports);
  applyAlerts(map, p.alertsGeoJSON);
  applyRadar(map, p.radarTileUrl);
  applyVisibility(map, p.visibility);
}

function applySelected(map: MLMap, name: string | null | undefined) {
  if (map.getLayer("nhoods-selected")) map.setFilter("nhoods-selected", ["==", ["get", "nhood"], name ?? ""]);
}

function applyReports(map: MLMap, reports: Report[]) {
  (map.getSource("reports") as GeoJSONSource | undefined)?.setData(reportsToGeoJSON(reports));
}

function applyAlerts(map: MLMap, alerts: GeoJSON.FeatureCollection | null) {
  if (alerts) (map.getSource("alerts") as GeoJSONSource | undefined)?.setData(alerts);
}

// Radar raster: swap the tile source when the frame URL changes.
function applyRadar(map: MLMap, url: string | null) {
  const src = map.getSource("radar") as maplibregl.RasterTileSource | undefined;
  const currentUrl = src ? (src as unknown as { tiles?: string[] }).tiles?.[0] : undefined;
  if (url && currentUrl !== url) {
    if (map.getLayer("radar")) map.removeLayer("radar");
    if (src) map.removeSource("radar");
    map.addSource("radar", { type: "raster", tiles: [url], tileSize: 256, maxzoom: 7 });
    map.addLayer(
      { id: "radar", type: "raster", source: "radar", paint: { "raster-opacity": 0.55 } },
      map.getLayer("alerts-fill") ? "alerts-fill" : undefined,
    );
  }
}

function applyVisibility(map: MLMap, visibility: LayerVisibility) {
  for (const [key, ids] of Object.entries(LAYER_IDS) as [LayerKey, string[]][]) {
    for (const id of ids) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility[key] ? "visible" : "none");
    }
  }
}
