# Suggested geographical areas to add

Notes from a review of `areas.geojson` (227 features). Forecast districts are already strong; gaps are mostly **geographical features**, especially **mountain ranges** in TAS, central Australia, NSW, and QLD.

---

## Mountain ranges

### Already present (relevant)

| Region | Areas |
|--------|--------|
| NSW | Greater Blue Mountains Area, Snowy Mountains |
| Central AU / SA | Musgrave Ranges, Flinders Ranges, Barrier Ranges |
| TAS | Great Western Tiers only |
| QLD | *No mountain-range geographical features* |
| VIC / WA | Well covered (Victorian Alps, Otways, Hamersley, Stirling, etc.) |

### Tasmania

**Strong adds**
- Ben Lomond
- Wellington Range (around Mt Wellington)
- West Coast Range / Tyndall Range
- Du Cane Range / Cradle Mountain–Lake St Clair ranges
- Arthur Range (Southwest)
- Hartz Mountains
- The Hazards (Freycinet)

**Nice-to-have:** Eldon Range, Frenchmans Cap massif, Frankland Range

### Central Australia (NT / northern SA)

**Biggest miss**
- MacDonnell Ranges (or split West / East MacDonnell)

**Also worth including**
- Petermann Ranges
- James Ranges
- Harts Range
- Everard Ranges (SA, near Musgrave)
- Gawler Ranges (SA)

### NSW

Beyond Blue Mountains / Snowies:
- Warrumbungle Range
- Barrington Tops / Mount Royal Range
- Liverpool Range
- Nandewar Range
- Brindabella Range (ACT / NSW)
- Australian Alps (NSW side — distinct from “Snowy Mountains” in briefing language)
- Illawarra Escarpment or Budawang Range

### Queensland

Highest-value misses (almost none exist today):
- McPherson Range / Border Ranges
- Main Range (Toowoomba–Warwick segment of the Divide)
- Bunya Mountains
- Glass House Mountains *(point already exists in `points.csv`)*
- Clarke Range (Mackay hinterland)
- Bellenden Ker Range / Walter Hill Range (Wet Tropics)
- Expedition Range / Carnarvon Range
- White Mountains

**Optional:** Peak Range, Connors Range, Blackdown Tableland

### Tight shortlist (~12)

If only adding the most obvious range gaps:

1. MacDonnell Ranges
2. Petermann Ranges
3. Warrumbungle Range
4. Barrington Tops
5. Brindabella Range
6. McPherson / Border Ranges
7. Main Range (QLD)
8. Bunya Mountains
9. Glass House Mountains
10. Clarke Range
11. Ben Lomond
12. West Coast Range (or Tyndall) + Wellington Range

---

## Broader area gaps (non-range)

### Forecast districts (BOM misses)

- Melbourne Metropolitan (VIC)
- Alpine Areas (VIC)
- Optional: Perth Metropolitan, Christmas Island, Cocos (Keeling) Islands

NSW / QLD / SA / TAS district sets look essentially complete.

### High-value geographical features

**National-scale / briefing staples**
- Great Dividing Range
- Bass Strait
- Coral Sea, Arafura Sea, Torres Strait
- Gulf of Carpentaria *(water body — land district already exists)*
- Great Barrier Reef
- Nullarbor Plain / Great Australian Bight
- Arnhem Land
- Cape York Peninsula *(as a feature; Peninsula district already exists)*

**By region**

| Region | Suggested areas |
|--------|-----------------|
| NSW | Kosciuszko NP, Jervis Bay |
| QLD | K'gari (Fraser Island), Atherton Tablelands, Moreton Bay, Whitsunday Islands, Burdekin / Fitzroy Rivers |
| VIC | Gippsland Lakes, Mornington Peninsula, Little/Big Desert |
| SA | The Coorong, Lake Alexandrina, Investigator Strait |
| WA | Lake Argyle, Exmouth Gulf, King Sound, Joseph Bonaparte Gulf, Fitzroy River, Dampier Peninsula, Houtman Abrolhos, Rottnest |
| NT | Roper River, Alligator Rivers, Cobourg Peninsula, Groote Eylandt, Litchfield / Nitmiluk |
| TAS | Derwent & Tamar Rivers, Macquarie Harbour, Freycinet, Cradle Mountain–Lake St Clair |
| Offshore AU | Lord Howe Island, Norfolk Island |

### VAAC / regional gaps

Present: many Indonesian islands and seas. Missing:
- Papua New Guinea (mainland) / New Ireland
- Arafura Sea, Flores Sea, Savu Sea, Celebes Sea, Makassar Strait

### Short shortlist if adding ~15 mixed areas

Melbourne Metropolitan, Alpine Areas, Great Dividing Range, Bass Strait, Coral Sea, Arafura Sea, Torres Strait, Gulf of Carpentaria, Great Barrier Reef, Nullarbor / Great Australian Bight, MacDonnell Ranges, Arnhem Land, Lake Argyle, The Coorong, K'gari, PNG mainland, Lord Howe Island.

---

## Notes

- Prefer named ranges / landmarks as `TYPE: Geographical feature`, matching Flinders, Hamersley, Victorian Alps, etc.
- Avoid flooding with every minor ridge, creek, or geological basin.
- Glass House Mountains already has a **point**; adding an **area** polygon would still be useful for Explore/quiz.
