import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error TS5097: extension import is required at runtime by node --test
import { parseChpFlooding, parseChpTime } from "./chp.ts";

const log = (id: string, time: string, type: string, loc: string, latlon: string, details: string[] = []) => `
		<Log ID = "${id}">
			<LogTime>"${time}"</LogTime>
			<LogType>"${type}"</LogType>
			<Location>"${loc}"</Location>
			<LocationDesc>""</LocationDesc>
			<Area>"San Francisco"</Area>
			<ThomasBrothers>""</ThomasBrothers>
			<LATLON>"${latlon}"</LATLON>
			<LogDetails>${details.length ? details.map((d) => `<details><DetailTime>"${time}"</DetailTime><IncidentDetail>"${d}"</IncidentDetail></details>`).join("") : "<details/>"}<units>
			<UnitTime>"${time}"</UnitTime>
			<UnitDetail>"Unit Assigned"</UnitDetail></units></LogDetails></Log>`;

const XML = `<?xml version="1.0" ?>
<State><Center ID = "SAHB">
<Dispatch ID = "SACC">
${log("261118SA1", "Nov 18 2026 11:55PM", "FLOOD-Roadway Flooding", "I80 W / Richards", "38550000:121750000", ["[1] LANE FLOODED"])}
</Dispatch>
<Dispatch ID = "GGCC">
${log("261118GG1", "Nov 18 2026  4:08PM", "FLOOD-Roadway Flooding", "US101 S / Cesar Chavez", "37748000:122406000", ["[1] WATER ON RDWY ", "[3] #2 LANE FLOODED, CARS SLOWING", "[2] CT NOTIFIED"])}
${log("261118GG2", "Nov 18 2026 5:00PM", "FLOOD-Roadway Flooding", "I80 W / Treasure Island", "0:0")}
${log("261118GG3", "Nov 18 2026 5:10PM", "1125-Traffic Hazard", "Lombard St / Van Ness Ave", "37800000:122424000", ["[1] DEBRIS"])}
${log("261118GG4", "Nov 18 2026 5:20PM", "1125-Traffic Hazard", "Great Hwy / Sloat", "37735000:122507000", ["[1] STANDING WATER ON ROADWAY"])}
${log("261118GG5", "Nov 18 2026 5:30PM", "FLOOD-Roadway Flooding", "I80 E / Vallejo", "38100000:122250000", ["[1] FLOODED"])}
</Dispatch>
</Center></State>`;

test("parseChpTime converts Pacific local time (PST) with a double space", () => {
  assert.equal(parseChpTime("Nov 18 2026  4:08PM"), "2026-11-19T00:08:00.000Z");
  assert.equal(parseChpTime("Nov 18 2026 12:05AM"), "2026-11-18T08:05:00.000Z");
  assert.equal(parseChpTime("Nov 18 2026 12:30PM"), "2026-11-18T20:30:00.000Z");
});

test("parseChpTime uses PDT in summer", () => {
  assert.equal(parseChpTime("Jul 04 2026 9:00AM"), "2026-07-04T16:00:00.000Z");
});

test("parseChpTime rejects garbage", () => {
  assert.equal(parseChpTime("yesterday"), null);
  assert.equal(parseChpTime("Foo 18 2026 4:08PM"), null);
});

test("parseChpFlooding keeps only GGCC, in-SF, flood-related, known-location logs", () => {
  const r = parseChpFlooding(XML);
  assert.deepEqual(r.map((x) => x.id), ["261118GG4", "261118GG1"]); // newest first
  const a = r[1];
  assert.equal(a.type, "FLOOD-Roadway Flooding");
  assert.equal(a.location, "US101 S / Cesar Chavez");
  assert.equal(a.area, "San Francisco");
  assert.equal(a.createdAt, "2026-11-19T00:08:00.000Z");
  assert.equal(a.lat, 37.748);
  assert.equal(a.lng, -122.406);
  assert.equal(a.latestDetail, "#2 LANE FLOODED, CARS SLOWING"); // highest [n], prefix stripped
  assert.equal(a.url, "https://cad.chp.ca.gov/");
});

test("non-FLOOD type matched via incident detail text", () => {
  const r = parseChpFlooding(XML).find((x) => x.id === "261118GG4");
  assert.ok(r);
  assert.equal(r.latestDetail, "STANDING WATER ON ROADWAY");
});

test("empty / malformed input yields []", () => {
  assert.deepEqual(parseChpFlooding(""), []);
  assert.deepEqual(parseChpFlooding("<State></State>"), []);
});
