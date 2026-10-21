# Sortie

A concept prototype for disaster recovery documentation: from a drone flight to a draft **Damage Description and Dimensions (DDD)** for FEMA Public Assistance.

**Live demo:** https://webgpu-demos.github.io/sortie-recovery/

Or open `index.html` locally. It is a single self-contained page with no build step. It needs internet access for fonts and three.js from public CDNs.

## The workflow

| Step | What it shows | Data |
|---|---|---|
| **1. Sweep** | Area-wide triage. Each building is colored on the Joint Damage Scale, blocked and flooded roads are marked, and a route runs from staging to a chosen facility. | **Real labels** (see below) |
| **2. Site** | Component-level defects on a 3D model of a facility, each with a measurement, uncertainty, supporting views and separate detection, association and material confidences. A reviewer confirms, rejects or sends each one to the field. | Illustrative |
| **3. Scope** | Confirmed defects become DDD line items, anything a drone can't see goes on a field checklist, and the Site Inspection Report fields export as CSV. | Illustrative |

The design combines two ideas:

- **Building-level triage and route planning over a whole area**, in the spirit of CLARKE (Texas A&M).
- **Component-level defect records with geolocation quality, provenance and human review**, as described in the *Flight to Field* concept.

## Data

The Sweep view uses real human-annotated labels for part of Fort Myers Beach, FL after Hurricane Ian (2022):

- **Source:** [CRASAR-U-DROIDs](https://huggingface.co/datasets/CRASAR/CRASAR-U-DROIDs), Center for Robot-Assisted Search and Rescue, Texas A&M University (Manzini, Murphy et al.). Licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Orthomosaic:** `train/annotations/UAS/*/1001-Ft-Myers-Beach-Boone.geo.tif.json`, building and road damage assessments.
- **Contents:**
  - 931 building footprints (Microsoft) with Joint Damage Scale labels: 531 no damage, 285 minor, 52 major, 52 destroyed, 11 un-classified.
  - 924 road polylines (OpenStreetMap).
  - 1,120 road damage patches (debris, obstruction, flooding, destruction).

`data/fmb_crasar.json` is a compact derivative. Coordinates are half-metre integers in a local frame (x east, y south), with the origin in `meta.origin` (WGS84). Each building is stored as an oriented bounding box. The same data is embedded in `index.html`.

### What is illustrative

The following are placed for the demo and are not real:

- building heights
- the staging point
- which buildings serve as the five sample public facilities (their footprints and damage labels are real)
- everything in the Site and Scope steps

## Road routing

- Road segments within 5 m of a **total obstruction**, **total flooding** or **destroyed** patch are treated as impassable.
- Segments near debris, partial obstruction or partial flooding are weighted as slower.
- When a facility's own access spur is cut off, the route ends at the closest reachable point and the page reports the remaining distance.

## Not in scope

This is a concept demo. It does not determine eligibility, cause or cost, it does not submit anything to FEMA, and it is not affiliated with FEMA or CRASAR. The labels are human annotations, not model output.

## Possible next steps

1. Train a building damage classifier on the UAS subset of CRASAR-U-DROIDs, evaluated on held-out disasters, and swap model output into the Sweep view.
2. Build a component-level segmentation model (roof covering, decking, debris) with SAM-assisted labeling.
3. Georeference defects by projecting camera rays onto the surface model, then add measurement and the DDD record schema.
