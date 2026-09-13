// Fictional sample data for the Enkel dashboard kit. Figures are placeholders.
const DASH = {
  user: { name: 'Jared', role: 'Design lead', market: 'Atlanta' },
  updated: '2 min ago',
  clubs: [
    { id: 'psc', name: 'Ponce City', market: 'Atlanta', cap: 120, members: 110, occ: 92, rev: 61200, revDelta: 3.1, occDelta: 2.4, status: 'ontrack', lead: 'Jared', trend: [80, 84, 86, 85, 89, 90, 92], revTrend: [52, 54, 53, 58, 57, 60, 61], open: 4, projects: 2 },
    { id: 'dec', name: 'Decatur', market: 'Atlanta', cap: 96, members: 78, occ: 81, rev: 52400, revDelta: 1.2, occDelta: 0.8, status: 'progress', lead: 'Sam', trend: [76, 78, 77, 80, 79, 81, 81], revTrend: [48, 49, 50, 50, 51, 52, 52], open: 6, projects: 1 },
    { id: 'wes', name: 'Westside', market: 'Atlanta', cap: 140, members: 104, occ: 74, rev: 48900, revDelta: -2.6, occDelta: -3.1, status: 'risk', lead: 'Mira', trend: [82, 80, 79, 78, 77, 75, 74], revTrend: [55, 54, 52, 51, 50, 49, 49], open: 9, projects: 3 },
    { id: 'buc', name: 'Buckhead', market: 'Atlanta', cap: 110, members: 96, occ: 87, rev: 57800, revDelta: 2.2, occDelta: 1.1, status: 'ontrack', lead: 'Sam', trend: [82, 83, 85, 84, 86, 87, 87], revTrend: [53, 54, 55, 56, 56, 57, 58], open: 3, projects: 1 },
    { id: 'nsh', name: 'Nashville East', market: 'Nashville', cap: 100, members: 62, occ: 62, rev: 38100, revDelta: 6.4, occDelta: 5.2, status: 'progress', lead: 'Mira', trend: [40, 45, 50, 53, 57, 60, 62], revTrend: [30, 32, 33, 35, 36, 37, 38], open: 11, projects: 2 },
    { id: 'chr', name: 'Charlotte South End', market: 'Charlotte', cap: 90, members: 0, occ: 0, rev: 0, revDelta: 0, occDelta: 0, status: 'notstarted', lead: 'Jared', trend: [0, 0, 0, 0, 0, 0, 0], revTrend: [0, 0, 0, 0, 0, 0, 0], open: 14, projects: 1 },
  ],
  projects: [
    { id: 'p1', name: 'Westside refresh', club: 'wes', phase: 'FF&E', status: 'risk', due: '2026-09-12', lead: 'Mira', done: 22, total: 31, required: 2, budget: 84000, spent: 71200, note: 'Booth fabric back-ordered — 3 weeks. Switch to warehouse stock or accept slip.' },
    { id: 'p2', name: 'Nashville East build-out', club: 'nsh', phase: 'Install', status: 'progress', due: '2026-10-03', lead: 'Mira', done: 48, total: 70, required: 0, budget: 320000, spent: 214000, note: 'On plan. Electrical sign-off Sep 18.' },
    { id: 'p3', name: 'Charlotte South End', club: 'chr', phase: 'Concept', status: 'blocked', due: '2026-11-20', lead: 'Jared', done: 6, total: 40, required: 3, budget: 410000, spent: 18500, note: 'Lease not signed. Concept work parked until it is.' },
    { id: 'p4', name: 'Ponce City signage', club: 'psc', phase: 'Design', status: 'ontrack', due: '2026-09-26', lead: 'Sam', done: 9, total: 14, required: 0, budget: 12000, spent: 4100, note: 'Signage plan linked. Vendor quote due Friday.' },
    { id: 'p5', name: 'Decatur big room', club: 'dec', phase: 'Brief', status: 'progress', due: '2026-12-01', lead: 'Sam', done: 2, total: 12, required: 1, budget: 46000, spent: 0, note: 'Brief in review with ops.' },
    { id: 'p6', name: 'Buckhead cold-cold', club: 'buc', phase: 'Handoff', status: 'done', due: '2026-08-29', lead: 'Jared', done: 18, total: 18, required: 0, budget: 9000, spent: 8650, note: 'Handed off Aug 29.' },
    { id: 'p7', name: 'Ponce City merch wall', club: 'psc', phase: 'FF&E', status: 'ontrack', due: '2026-10-10', lead: 'Sam', done: 11, total: 20, required: 0, budget: 15000, spent: 6200, note: 'Shelving pulled from bin C-04.' },
    { id: 'p8', name: 'Westside wayfinding', club: 'wes', phase: 'Design', status: 'progress', due: '2026-10-17', lead: 'Mira', done: 5, total: 16, required: 1, budget: 7000, spent: 900, note: 'Waiting on floor plan.' },
    { id: 'p9', name: 'Westside patio', club: 'wes', phase: 'Concept', status: 'notstarted', due: '2027-01-15', lead: 'Jared', done: 0, total: 22, required: 0, budget: 60000, spent: 0, note: 'Starts after refresh closes.' },
  ],
  phases: ['Brief', 'Concept', 'Design', 'FF&E', 'Install', 'Handoff'],
  // Thresholds the ops team agreed on. `warn` → amber (data-3), `bad` → brick (data-4). Per-club occupancy targets override the default; new clubs ramp lower.
  targets: {
    occupancy: { default: { warn: 75, bad: 65 }, nsh: { warn: 55, bad: 45 }, chr: null },
    load: { warn: 80, bad: 95 },
    stock: { warn: 0.6, bad: 0.35 }, // fraction of the item's min
    budget: { warn: 0.85, bad: 1 }, // fraction of budget spent
    fill: { warn: 85, bad: 95 },
  },
  warehouse: { fill: 71, fillDelta: 4, bins: 96, free: 28, pulls7: [6, 9, 4, 11, 8, 12, 7], updated: '14 min ago',
    low: [{ label: 'Booth fabric — charcoal', value: 2, min: 6 }, { label: 'Pendant — brass 14"', value: 3, min: 8 }, { label: 'Stool — walnut', value: 5, min: 10 }, { label: 'Planter — 24" black', value: 7, min: 8 }],
    items: [
      { id: 'w1', name: 'Booth fabric — charcoal', cat: 'Fabric', qty: 2, min: 6, bin: 'A-03', reserved: 'p1', pulls: [1, 0, 2, 0, 1, 1, 0] },
      { id: 'w2', name: 'Pendant — brass 14"', cat: 'Lighting', qty: 3, min: 8, bin: 'B-11', reserved: 'p2', pulls: [0, 2, 0, 1, 0, 2, 1] },
      { id: 'w3', name: 'Stool — walnut', cat: 'Seating', qty: 5, min: 10, bin: 'C-02', reserved: null, pulls: [0, 1, 0, 3, 1, 0, 2] },
      { id: 'w4', name: 'Planter — 24" black', cat: 'Decor', qty: 7, min: 8, bin: 'D-07', reserved: null, pulls: [1, 0, 0, 1, 0, 1, 0] },
      { id: 'w5', name: 'Shelving — oak 36"', cat: 'Millwork', qty: 14, min: 6, bin: 'C-04', reserved: 'p7', pulls: [2, 1, 0, 2, 3, 1, 0] },
      { id: 'w6', name: 'Task chair — grey', cat: 'Seating', qty: 22, min: 12, bin: 'A-08', reserved: null, pulls: [1, 3, 0, 2, 1, 4, 2] },
      { id: 'w7', name: 'Sconce — black', cat: 'Lighting', qty: 11, min: 6, bin: 'B-02', reserved: null, pulls: [0, 0, 1, 0, 1, 0, 0] },
      { id: 'w8', name: 'Rug — 8×10 natural', cat: 'Decor', qty: 6, min: 4, bin: 'D-01', reserved: 'p2', pulls: [0, 1, 0, 1, 0, 1, 0] },
      { id: 'w9', name: 'Table — 4-top oak', cat: 'Tables', qty: 9, min: 6, bin: 'C-09', reserved: null, pulls: [1, 0, 1, 0, 1, 2, 1] },
      { id: 'w10', name: 'Phone booth panel', cat: 'Millwork', qty: 4, min: 2, bin: 'A-12', reserved: 'p1', pulls: [0, 1, 0, 0, 1, 0, 0] },
    ],
  },
  signageStages: ['Brief', 'Design', 'Proof', 'Fabrication', 'Installed'],
  signs: [
    { id: 's1', name: 'Exterior blade', club: 'psc', type: 'Exterior', stage: 'Proof', vendor: 'Atlanta Sign Co.', owner: 'Sam', due: '2026-09-19', days: 4, cost: 4200 },
    { id: 's2', name: 'Entry vinyl', club: 'psc', type: 'Wayfinding', stage: 'Design', vendor: '—', owner: 'Sam', due: '2026-09-26', days: 2, cost: 600 },
    { id: 's3', name: 'Room numbers × 14', club: 'psc', type: 'Wayfinding', stage: 'Fabrication', vendor: 'Atlanta Sign Co.', owner: 'Sam', due: '2026-09-24', days: 6, cost: 1900 },
    { id: 's4', name: 'Monument sign', club: 'nsh', type: 'Exterior', stage: 'Fabrication', vendor: 'Music City Signs', owner: 'Mira', due: '2026-09-30', days: 9, cost: 11800 },
    { id: 's5', name: 'Lobby wordmark', club: 'nsh', type: 'Interior', stage: 'Fabrication', vendor: 'Music City Signs', owner: 'Mira', due: '2026-09-30', days: 9, cost: 3400 },
    { id: 's6', name: 'Restroom set', club: 'nsh', type: 'Wayfinding', stage: 'Proof', vendor: 'Music City Signs', owner: 'Mira', due: '2026-10-01', days: 3, cost: 800 },
    { id: 's7', name: 'Hours decal', club: 'nsh', type: 'Exterior', stage: 'Brief', vendor: '—', owner: 'Mira', due: '2026-10-02', days: 1, cost: 150 },
    { id: 's8', name: 'Directory', club: 'wes', type: 'Wayfinding', stage: 'Design', vendor: '—', owner: 'Mira', due: '2026-10-17', days: 12, cost: 2200 },
    { id: 's9', name: 'Floor arrows', club: 'wes', type: 'Wayfinding', stage: 'Design', vendor: '—', owner: 'Mira', due: '2026-10-17', days: 12, cost: 400 },
    { id: 's10', name: 'Patio blade', club: 'wes', type: 'Exterior', stage: 'Brief', vendor: '—', owner: 'Jared', due: '2027-01-10', days: 2, cost: 3800 },
    { id: 's11', name: 'Concept board', club: 'chr', type: 'Interior', stage: 'Brief', vendor: '—', owner: 'Jared', due: '2026-11-20', days: 15, cost: 0 },
    { id: 's12', name: 'Big room plaque', club: 'dec', type: 'Interior', stage: 'Design', vendor: '—', owner: 'Sam', due: '2026-11-15', days: 5, cost: 900 },
    { id: 's13', name: 'Fabrication sample', club: 'dec', type: 'Interior', stage: 'Fabrication', vendor: 'Atlanta Sign Co.', owner: 'Sam', due: '2026-09-20', days: 3, cost: 300 },
    { id: 's14', name: 'Menu board', club: 'buc', type: 'Interior', stage: 'Design', vendor: '—', owner: 'Sam', due: '2026-10-05', days: 7, cost: 1100 },
    { id: 's15', name: 'Exterior blade', club: 'buc', type: 'Exterior', stage: 'Installed', vendor: 'Atlanta Sign Co.', owner: 'Jared', due: '2026-08-20', days: 17, cost: 4100 },
    { id: 's16', name: 'Cold-cold door set', club: 'buc', type: 'Wayfinding', stage: 'Installed', vendor: 'Atlanta Sign Co.', owner: 'Jared', due: '2026-08-27', days: 10, cost: 700 },
    { id: 's17', name: 'Lobby wordmark', club: 'dec', type: 'Interior', stage: 'Installed', vendor: 'Atlanta Sign Co.', owner: 'Sam', due: '2026-07-30', days: 38, cost: 3200 },
    { id: 's18', name: 'Room numbers × 9', club: 'dec', type: 'Wayfinding', stage: 'Installed', vendor: 'Atlanta Sign Co.', owner: 'Sam', due: '2026-07-30', days: 38, cost: 1300 },
    { id: 's19', name: 'Restroom set', club: 'psc', type: 'Wayfinding', stage: 'Installed', vendor: 'Atlanta Sign Co.', owner: 'Sam', due: '2026-06-12', days: 86, cost: 800 },
    { id: 's20', name: 'Merch wall header', club: 'psc', type: 'Interior', stage: 'Installed', vendor: 'Atlanta Sign Co.', owner: 'Sam', due: '2026-08-14', days: 23, cost: 950 },
  ],
  team: [
    { id: 'mira', name: 'Mira', role: 'Designer', open: 24, required: 3, load: 88, capacity: 30, market: 'Atlanta · Nashville', week: [26, 27, 28, 26, 24, 25, 24], projects: ['p1', 'p2', 'p8'], clubs: ['wes', 'nsh'] },
    { id: 'sam', name: 'Sam', role: 'Designer', open: 17, required: 1, load: 64, capacity: 30, market: 'Atlanta', week: [14, 15, 15, 17, 16, 18, 17], projects: ['p4', 'p5', 'p7'], clubs: ['psc', 'dec', 'buc'] },
    { id: 'jared', name: 'Jared', role: 'Design lead', open: 12, required: 3, load: 52, capacity: 24, market: 'All', week: [10, 12, 11, 13, 12, 12, 12], projects: ['p3', 'p6', 'p9'], clubs: ['psc', 'chr'] },
    { id: 'ops', name: 'Ops', role: 'Ops', open: 9, required: 0, load: 40, capacity: 24, market: 'All', week: [9, 8, 10, 9, 9, 10, 9], projects: [], clubs: [] },
  ],
  budget: { total: 963000, spent: 323550, spark: [8, 12, 19, 22, 27, 30, 34] },
};
// Threshold → data tone. Returns 1 (fine), 3 (amber/warn), 4 (brick/bad). `higherIsBad` for load/fill/budget-spent.
DASH.tone = (metric, value, id) => {
  const t = DASH.targets[metric]; if (!t) return 1;
  const th = t.default ? (id in t ? t[id] : t.default) : t; if (!th) return 5;
  const bad = th.bad, warn = th.warn, hib = bad > warn;
  if (hib) return value >= bad ? 4 : value >= warn ? 3 : 1;
  return value < bad ? 4 : value < warn ? 3 : 1;
};
DASH.target = (metric, id) => { const t = DASH.targets[metric]; return t && t.default ? (id in t ? t[id] : t.default) : t; };
window.DASH = DASH;
// Stage aggregate derives from the pieces so Overview and Signage always agree.
DASH.signage = DASH.signageStages.map(st => ({ label: st, value: DASH.signs.filter(s => s.stage === st).length }));
