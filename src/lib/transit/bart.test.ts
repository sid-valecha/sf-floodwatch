import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error TS5097: extension import is required at runtime by node --test
import { parseBart, parseBartTime } from "./bart.ts";

const live = {
  root: {
    date: "11/19/2026",
    time: "11:39:01 AM PST",
    bsa: [
      {
        "@id": "560",
        station: "BART",
        type: "DELAY",
        description: { "#cdata-section": "Expect 30-minute delays starting at 9pm each night between Millbrae, SFO, and Daly City due to construction work. " },
        sms_text: { "#cdata-section": "short" },
        posted: "Thu Nov 19 2026 06:31 AM PST",
        expires: "No time provided.",
      },
    ],
  },
};
const elevLive = {
  root: {
    bsa: [
      {
        "@id": "11191139",
        station: "BART",
        type: "ELEVATOR",
        description: { "#cdata-section": "There is 1 elevator out of service at this time: CAST: Station" },
        posted: "",
        expires: "",
      },
    ],
  },
};

test("array response (live fixture)", () => {
  const a = parseBart(live, "advisory");
  assert.equal(a.length, 1);
  assert.equal(a[0].id, "bart-advisory-560");
  assert.equal(a[0].title, "Delay");
  assert.equal(a[0].postedAt, "2026-11-19T14:31:00.000Z");
  assert.equal(a[0].weatherRelated, false);
  assert.equal(a[0].url, "https://www.bart.gov/schedules/advisories");
  assert.ok(!a[0].text.endsWith(" "));
});

test("single-object bsa", () => {
  const a = parseBart({ root: { bsa: live.root.bsa[0] } }, "advisory");
  assert.equal(a.length, 1);
});

test("no-delays item and empty/missing bsa yield nothing", () => {
  const none = { root: { bsa: { "@id": "1", station: "BART", type: "DELAY", description: { "#cdata-section": "No delays reported." } } } };
  assert.deepEqual(parseBart(none, "advisory"), []);
  assert.deepEqual(parseBart({ root: {} }, "advisory"), []);
  assert.deepEqual(parseBart(null, "advisory"), []);
});

test("weather-related flag and elevator kind", () => {
  const w = parseBart({ root: { bsa: [{ "@id": "2", type: "DELAY", description: "Flooding near Embarcadero causing delays" }] } }, "advisory");
  assert.equal(w[0].weatherRelated, true);
  const t = parseBart({ root: { bsa: [{ "@id": "3", type: "DELAY", description: "Delay due to an equipment problem on a train" }] } }, "advisory");
  assert.equal(t[0].weatherRelated, false, "train must not match rain");
  const e = parseBart(elevLive, "elevator");
  assert.equal(e[0].kind, "elevator");
  assert.equal(e[0].postedAt, undefined);
});

test("parseBartTime handles PDT, PST and garbage", () => {
  assert.equal(parseBartTime("Mon Jul 06 2026 12:05 PM PDT"), "2026-07-06T19:05:00.000Z");
  assert.equal(parseBartTime("Thu Nov 19 2026 12:05 AM PST"), "2026-11-19T08:05:00.000Z");
  assert.equal(parseBartTime("No time provided."), undefined);
});
