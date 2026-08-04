# Panelization phase 2 plan (shared panel-fiducial alignment)

Phase 1 (shipped): `POST /api/job/panelize` lays a grid of independent
`BoardLocation`s into a job; each board aligns from its own fiducials.

Phase 2 goal: make the grid a real OpenPnP `Panel` with panel-level fiducials so
the whole array aligns as one unit from 2-3 panel fiducials.

## What the spike found (2026-08-03)

Headless creation IS viable, with these facts:

- `Panel` (OpenPnP 2.0) is a `PlacementsHolder` whose children are the boards
  (`BoardLocation`s) at explicit grid locations, plus its own `placements`
  (panel fiducials) and optional `pseudoPlacements` (child placements reused for
  alignment). Old rows/cols/gap fields are deprecated.
- `Panel.addChild(child)` is headless-safe. `Panel.setChild(...)` is NOT — it
  calls `MainFrame.get().getJobTab()` (null headless). Build with `addChild`.
- `PanelLocation(Panel)` wraps a panel; `job.addBoardOrPanelLocation(...)`
  accepts a `PanelLocation`; `Configuration.get().resolvePanel(job, pl)` is
  headless-safe (takes the job as a param, no MainFrame).
- **Panels are stored as separate `<config>/panels/<name>.panel.xml` files**
  (like boards). `resolvePanel` for a non-root panel loads the definition FROM
  its file and builds an instance copy (definition/instance model). So a job's
  `PanelLocation` must carry a `fileName` pointing at a real panel file.

## Build steps

1. Backend: new `POST /api/job/panelize2` (or extend panelize with `asPanel`):
   - Create `Panel`; set its dimensions; `addChild` the grid of `BoardLocation`s
     at (col*xPitch, row*yPitch).
   - Add panel fiducials: `Placement`s on the panel with a fiducial `Part`
     (e.g. `FIDUCIAL-HOME`) at the requested X/Y; set them as fiducial type.
   - Save the panel to `<config>/panels/<name>.panel.xml` (add a `panelsDir()`
     + a load-at-boot like `loadBoardsFolder`, and `getPanel(file)` registration).
   - Job: `PanelLocation pl = new PanelLocation(panel); pl.setFileName(panelPath);
     pl.setCheckFiducials(true); job.addBoardOrPanelLocation(pl);`
   - `Configuration.get().resolvePanel(job, pl);` then `syncJob()`.
2. Serialization round-trip test (headless-verifiable): create panel -> save job
   -> reload job -> confirm the `PanelLocation` resolves, children + fiducials
   intact, `getDescendantBoardLocations()` returns the grid.
3. Frontend: extend the Panelize tab with a "single panel" toggle and 2-3
   fiducial rows (X/Y + fiducial part select).

## Why it was not shipped tonight

The alignment payoff can only be validated on the machine (locate the panel
fiducials, confirm the computed transform places the array correctly). Building
the panel-file + definition/instance plumbing and committing it unvalidated
risks a feature that looks done but misplaces a whole panel of boards. Do this
in a hardware session: it is a few hours of focused work on top of this spike.

## Open questions for that session

- Panel fiducial parts/positions: fixed panel rail fiducials, or pseudo-placements
  off the child boards? (Panel fiducials are simpler and match physical panels.)
- Panel file naming + cleanup when a job is deleted.
- Whether to keep phase-1 (loose boards) as a separate quick option.
