# Local scene assets

Downloaded from the public Cubicles asset endpoints for the requested local recreation. Original content remains attributed to Cubicles and its declared Higgsfield source; this record makes no assertion about redistribution licensing. No JavaScript was executed to obtain or inspect these assets.

## Loading guide

All URLs below are served locally as `/models/<filename>.glb`. Load with Three.js GLTFLoader. All 11 files are glTF 2 binary containers, with zero external textures, animations or skins. The original 9 r6 payloads were base64 decoded and gzip decompressed; resulting GLB SHA256 and byte length exactly match the published frontend manifest. Commons/cubicle have locally computed SHA256 because no source hash was supplied for those two.

Each downloaded scene is flat: every listed node is a direct child of the scene. HF roots can contain multiple material primitives; GLTFLoader may represent these as a Group with mesh children. Clone the named root with `scene.getObjectByName(name).clone(true)`, preserve its internal transforms, traverse mesh children to set castShadow/receiveShadow. Clone materials before per-instance recoloring. Do not add an entire HF pack or commons scene to the world: they are asset libraries whose furniture overlaps at the origin.

HF units are meters, up axis Y, origin floor-center, base at Y=0. The declared source is https://higgsfield.ai/3d-jutsu/eaa2c37f-b1ab-49a6-ab51-731d54338fca revision 6 (the full initial frontend manifest contains later additional packs). Raw coordinate/accessor facts and source download hashes are in `../cubicles-research/evidence/local-asset-inventory.json`.

## Recommended assembly

- Full classic workstation: clone all of `cubicle.glb` as one Group, retaining its 13 meshes. Bounding box is X [-4.375,4.375], Y [.025,2.1], Z [-4.025,4]. Floor is 8.5×8; back wall lies at negative Z; entrance faces positive Z. A 10×10 plot leaves .625 side margins. Scale the whole group uniformly if using smaller plots.

- Cubicle desk is centered around Z=-1 and top Y≈1.21; chair center lies around Z=.50. The assembly is already positioned; do not separately recenter each mesh. `extras.tint` distinguishes accent/partition/fixed surfaces. All cubicle/commons meshes use baked vertex colors with a shared material, so replacing material color multiplies those colors.

- Modern station: `foundation.glb` -> HF_Desk_Classic at (0,0,-.3), `seating.glb` -> HF_Chair_Task at (0,0,.65) rotated Y=π, and `tech.glb` -> HF_Monitor_Ultrawide at (0,.7775,-.42). Desk dimensions 1.6×.7775×.75. Chair dimensions .704×1.117×.739. Chair default faces +Z (upper backrest geometry is on -Z); rotating π lets it face the desk. Monitor MAT_Screen is on +Z, so default monitor faces the seated chair. These are geometry-derived orientation suggestions, not a rendered screenshot check.

- HF desk accessories start at Y=0 and should be placed on desk top Y=.7775. Simple foreground options: HF_Keyboard_Mouse or HF_CompactKeyboard in tech, and HF_PenCup / HF_WaterBottle in desk-details. Coffee pack contains floor appliances such as HF_CoffeeMachine and HF_MiniFridge. Use the exact inventory table names below.

- Commons lounge/park: choose CafeCounter, CafeStool, LoungeSofa, LoungeChair, CoffeeTable, GardenBench, PlanterTall, TreeRound, PalmTree, PingPongTable, ChessTable, etc. These nodes retain authored scale/rotation (notably trees and terrain). Clone root transform unchanged, then set position; inspect negative minY for base correction if placing on floor.

- Partition examples: HF_CubiclePanel_Straight 2.43×1.47×.14; HF_CubiclePanel_Corner 2.1×1.44×2.1. Place panels at plot boundaries. These HF dimensions are independent from the larger stylized classic cubicle kit.

## Download provenance

| File | Bytes | SHA256 | Source |
|---|---:|---|---|
| commons.glb | 2193364 | `1465a19e02ce598413ae6d443bf6ba2a8187d2a49f8325e2b8372c604eb0c3f9` | [commons](https://www.cubicles.lol/models/cubicles/v1/commons.glb) |
| cubicle.glb | 264372 | `c938475264ace7b14a50ab5a3c65ae15ee15efbfbc82c24f88e372ae269d7a4e` | [cubicle](https://www.cubicles.lol/models/cubicles/v1/cubicle.glb) |
| foundation.glb | 175952 | `4431f2c0aef633acba5d16cf1a0b85a590ba35ce276c4a6ac37f75669cb46af5` | [foundation](https://www.cubicles.lol/models/cubicles/higgsfield-r6/foundation.glb.gz.b64) |
| seating.glb | 387116 | `8c4f1d94e04f5d2f45f59bcd80d7eb51e424b6141168740c893800d8464d1a45` | [seating](https://www.cubicles.lol/models/cubicles/higgsfield-r6/seating.glb.gz.b64) |
| tech.glb | 667440 | `23ed87d056a095a87e4bfbec2918f5b8ff1934d162fdb4664221c4b77547dd1d` | [tech](https://www.cubicles.lol/models/cubicles/higgsfield-r6/tech.glb.gz.b64) |
| greenery.glb | 540436 | `f3af1fe147b8e4449b0692a8ea55c6cea7cd5b99ce46d2c09d57204dfb76f246` | [greenery](https://www.cubicles.lol/models/cubicles/higgsfield-r6/greenery.glb.gz.b64) |
| lighting.glb | 247960 | `8fa577252c4d3a498b827ee1c9710908bea7079e55bd91ebb8cfb8dd5e38ab54` | [lighting](https://www.cubicles.lol/models/cubicles/higgsfield-r6/lighting.glb.gz.b64) |
| decor.glb | 340656 | `d02cd44a742066f731fc3c6cb1d6d96161d10b0b93744c74c0ae338f98638778` | [decor](https://www.cubicles.lol/models/cubicles/higgsfield-r6/decor.glb.gz.b64) |
| desk-details.glb | 553168 | `7fdbe1b8cd431576f92b9a97e0bed7253e61b4e5f7cd43d4f434f3112696cb21` | [desk-details](https://www.cubicles.lol/models/cubicles/higgsfield-r6/desk-details.glb.gz.b64) |
| coffee.glb | 199696 | `da3bc8b61bfc01464c754d4824d8983c483188cfbfdf23180187424a2178bdd1` | [coffee](https://www.cubicles.lol/models/cubicles/higgsfield-r6/coffee.glb.gz.b64) |
| personality.glb | 246040 | `1c11dfaef40cef011603dec2cf44386141e040257461f38caff6658633b168a3` | [personality](https://www.cubicles.lol/models/cubicles/higgsfield-r6/personality.glb.gz.b64) |

Total local GLB bytes: 5,816,200.

## Exact node dimensions

Dimensions below are X width × Y height × Z depth after the original node TRS, using POSITION accessor min/max. They are conservative axis-aligned boxes. Full primitive material IDs, vertex-color flags, original local min/max, node TRS and extras are retained in the evidence JSON. For a library scene, the aggregate whole-scene box is not a meaningful single furniture dimension.

### commons.glb

Default scene 0; 83 direct root nodes; 1 materials; generator `Khronos glTF Blender I/O v4.5.48`.

| Root node | Width × Height × Depth | Min XYZ | Max XYZ | Primitives |
|---|---|---|---|---:|
| `CafeCounter` | 5.200, 2.651, 1.750 | -2.600, 0.015, -0.875 | 2.600, 2.667, 0.875 | 1 |
| `CafeStool` | 0.780, 1.024, 0.780 | -0.390, 0.076, -0.390 | 0.390, 1.100, 0.390 | 1 |
| `LoungeSofa` | 3.500, 1.475, 1.485 | -1.750, 0.030, -0.740 | 1.750, 1.505, 0.745 | 1 |
| `LoungeChair` | 1.600, 1.475, 1.485 | -0.800, 0.030, -0.740 | 0.800, 1.505, 0.745 | 1 |
| `CoffeeTable` | 2.200, 0.959, 1.300 | -1.100, 0.063, -0.650 | 1.100, 1.022, 0.650 | 1 |
| `PlanterTall` | 1.883, 3.450, 1.809 | -0.906, 0.050, -1.036 | 0.977, 3.500, 0.773 | 1 |
| `PlanterLong` | 2.800, 1.735, 0.880 | -1.400, 0.045, -0.440 | 1.400, 1.780, 0.440 | 1 |
| `IdeasBoard` | 3.680, 2.900, 0.900 | -1.840, 0.020, -0.450 | 1.840, 2.920, 0.450 | 1 |
| `GlowLamp` | 0.560, 2.280, 0.560 | -0.280, 0.015, -0.280 | 0.280, 2.295, 0.280 | 1 |
| `PatchworkRug` | 6.800, 0.066, 5.800 | -3.400, 0.019, -2.900 | 3.400, 0.086, 2.900 | 1 |
| `GardenBench` | 3.200, 1.510, 0.820 | -1.600, 0.040, -0.430 | 1.600, 1.550, 0.390 | 1 |
| `BistroTable` | 1.620, 1.095, 1.620 | -0.810, 0.040, -0.810 | 0.810, 1.135, 0.810 | 1 |
| `BistroChair` | 0.760, 1.282, 0.755 | -0.380, 0.038, -0.395 | 0.380, 1.320, 0.360 | 1 |
| `Bookshelf` | 3.420, 2.720, 0.730 | -1.710, 0.040, -0.365 | 1.710, 2.760, 0.365 | 1 |
| `PrinterCart` | 1.300, 1.472, 1.050 | -0.650, 0.040, -0.495 | 0.650, 1.512, 0.555 | 1 |
| `VendingMachine` | 1.300, 2.520, 1.160 | -0.650, 0.050, -0.550 | 0.650, 2.570, 0.610 | 1 |
| `WaterCooler` | 0.670, 1.605, 0.740 | -0.335, 0.150, -0.335 | 0.335, 1.755, 0.405 | 1 |
| `RecyclingStation` | 1.420, 0.936, 0.660 | -0.710, 0.040, -0.330 | 0.710, 0.976, 0.330 | 1 |
| `PalmTree` | 5.735, 5.994, 5.121 | -2.517, -0.300, -2.561 | 3.217, 5.694, 2.561 | 1 |
| `BeachUmbrella` | 4.400, 3.325, 4.185 | -2.200, 0.025, -2.092 | 2.200, 3.350, 2.092 | 1 |
| `BeachLounger` | 1.020, 0.921, 2.365 | -0.510, 0.045, -1.215 | 0.510, 0.966, 1.150 | 1 |
| `PicnicTable` | 3.500, 1.159, 2.590 | -1.750, 0.061, -1.295 | 1.750, 1.220, 1.295 | 1 |
| `CoastalRocks` | 2.266, 0.941, 1.323 | -1.249, 0.012, -0.756 | 1.017, 0.952, 0.567 | 1 |
| `DuneGrass` | 0.933, 0.750, 0.922 | -0.463, 0.020, -0.468 | 0.470, 0.770, 0.454 | 1 |
| `FlowerPlanter` | 2.400, 1.077, 0.790 | -1.200, 0.050, -0.395 | 1.200, 1.127, 0.395 | 1 |
| `ArcadeCabinet` | 1.110, 2.180, 1.150 | -0.555, 0.090, -0.540 | 0.555, 2.270, 0.610 | 1 |
| `LanternPost` | 0.570, 3.230, 0.570 | -0.285, 0.020, -0.285 | 0.285, 3.250, 0.285 | 1 |
| `StringArch` | 5.530, 4.065, 0.430 | -2.765, 0.010, -0.215 | 2.765, 4.075, 0.215 | 1 |
| `BikeRack` | 3.224, 1.192, 0.084 | -1.612, 0.080, -0.042 | 1.612, 1.272, 0.042 | 1 |
| `SucculentPot` | 0.420, 0.600, 0.420 | -0.210, 0.020, -0.210 | 0.210, 0.620, 0.210 | 1 |
| `BooksStack` | 0.730, 0.230, 0.480 | -0.340, 0.035, -0.240 | 0.390, 0.265, 0.240 | 1 |
| `CoffeeTray` | 1.080, 0.311, 0.570 | -0.540, 0.020, -0.285 | 0.540, 0.332, 0.285 | 1 |
| `FloorCushion` | 1.100, 0.410, 1.100 | -0.550, 0.035, -0.550 | 0.550, 0.446, 0.550 | 1 |
| `GardenTrellis` | 3.630, 3.110, 0.344 | -1.815, 0.020, -0.090 | 1.815, 3.130, 0.254 | 1 |
| `PocketGarden` | 7.200, 1.760, 4.600 | -3.600, 0.040, -2.300 | 3.600, 1.800, 2.300 | 1 |
| `TreeRound` | 4.689, 5.875, 3.239 | -2.436, 0.025, -1.891 | 2.252, 5.900, 1.348 | 1 |
| `CypressTree` | 1.807, 4.975, 1.900 | -0.904, 0.025, -0.950 | 0.904, 5.000, 0.950 | 1 |
| `OliveTree` | 4.149, 4.825, 2.899 | -1.997, 0.025, -1.536 | 2.152, 4.850, 1.363 | 1 |
| `MapleTree` | 4.689, 5.875, 3.239 | -2.436, 0.025, -1.891 | 2.252, 5.900, 1.348 | 1 |
| `BambooPlanter` | 2.502, 3.380, 0.850 | -1.252, 0.020, -0.425 | 1.250, 3.400, 0.425 | 1 |
| `FernPlanter` | 1.730, 1.180, 1.253 | -0.863, 0.030, -0.637 | 0.867, 1.210, 0.616 | 1 |
| `CactusPlanter` | 0.950, 2.075, 0.950 | -0.475, 0.025, -0.475 | 0.475, 2.100, 0.475 | 1 |
| `PebbleBed` | 5.000, 0.435, 3.000 | -2.500, 0.010, -1.500 | 2.500, 0.445, 1.500 | 1 |
| `ButterflyGarden` | 4.300, 1.225, 2.300 | -2.150, 0.035, -1.150 | 2.150, 1.260, 1.150 | 1 |
| `ReflectingPool` | 6.000, 0.590, 3.600 | -3.000, 0.030, -1.800 | 3.000, 0.620, 1.800 | 1 |
| `BirdBath` | 1.700, 1.490, 1.700 | -0.850, 0.020, -0.850 | 0.850, 1.510, 0.850 | 1 |
| `SteppingStone` | 1.400, 0.120, 1.000 | -0.700, 0.010, -0.500 | 0.700, 0.130, 0.500 | 1 |
| `GrassPatch` | 7.000, 0.480, 4.500 | -3.500, 0.010, -2.250 | 3.500, 0.490, 2.250 | 1 |
| `CurvedBench` | 4.025, 0.800, 3.021 | -1.924, 0.000, -1.879 | 2.101, 0.800, 1.142 | 1 |
| `AdirondackChair` | 1.280, 1.595, 1.250 | -0.640, 0.000, -0.625 | 0.640, 1.595, 0.625 | 1 |
| `BeanBag` | 1.476, 1.150, 1.505 | -0.738, 0.030, -0.782 | 0.738, 1.180, 0.723 | 1 |
| `Hammock` | 5.600, 2.820, 1.500 | -2.800, 0.030, -0.750 | 2.800, 2.850, 0.750 | 1 |
| `RockingChair` | 0.960, 1.650, 1.550 | -0.480, 0.000, -0.775 | 0.480, 1.650, 0.775 | 1 |
| `Daybed` | 3.100, 0.765, 1.450 | -1.550, 0.240, -0.725 | 1.550, 1.005, 0.725 | 1 |
| `LongWorktable` | 4.700, 1.385, 1.600 | -2.350, 0.000, -0.800 | 2.350, 1.385, 0.800 | 1 |
| `DraftingDesk` | 2.900, 1.365, 1.700 | -1.450, 0.000, -0.850 | 1.450, 1.365, 0.850 | 1 |
| `WorkshopShelf` | 3.000, 2.510, 0.900 | -1.500, 0.050, -0.450 | 1.500, 2.560, 0.450 | 1 |
| `ToolWall` | 3.200, 2.600, 0.315 | -1.600, 0.100, -0.100 | 1.600, 2.700, 0.215 | 1 |
| `PingPongTable` | 4.800, 1.510, 2.750 | -2.400, 0.000, -1.375 | 2.400, 1.510, 1.375 | 1 |
| `FoosballTable` | 3.100, 1.625, 2.250 | -1.550, 0.000, -1.125 | 1.550, 1.625, 1.125 | 1 |
| `ChessTable` | 1.700, 1.520, 1.700 | -0.850, 0.000, -0.850 | 0.850, 1.520, 0.850 | 1 |
| `RecordConsole` | 3.250, 1.532, 0.900 | -1.625, 0.065, -0.450 | 1.625, 1.597, 0.450 | 1 |
| `SnackCart` | 2.550, 1.490, 1.250 | -1.275, 0.045, -0.625 | 1.275, 1.535, 0.625 | 1 |
| `PizzaOven` | 2.300, 2.605, 2.200 | -1.150, 0.040, -0.900 | 1.150, 2.645, 1.300 | 1 |
| `JuiceBar` | 3.850, 1.970, 1.500 | -1.925, 0.070, -0.750 | 1.925, 2.040, 0.750 | 1 |
| `RetroJukebox` | 1.600, 2.495, 0.892 | -0.800, 0.160, -0.400 | 0.800, 2.655, 0.492 | 1 |
| `Telescope` | 1.895, 2.245, 1.300 | -0.975, 0.030, -0.650 | 0.920, 2.275, 0.650 | 1 |
| `SculptureLoop` | 3.716, 3.975, 1.400 | -1.858, 0.025, -0.700 | 1.858, 4.000, 0.700 | 1 |
| `SculptureStack` | 1.800, 3.280, 1.800 | -0.900, 0.010, -0.900 | 0.900, 3.290, 0.900 | 1 |
| `SurfRack` | 3.420, 3.055, 0.438 | -1.710, 0.050, -0.090 | 1.710, 3.105, 0.348 | 1 |
| `LifebuoyStand` | 1.206, 2.740, 0.750 | -0.603, 0.010, -0.375 | 0.603, 2.750, 0.375 | 1 |
| `BeachFlag` | 1.245, 3.525, 0.800 | -0.400, 0.025, -0.400 | 0.845, 3.550, 0.400 | 1 |
| `BeachTowel` | 1.400, 0.053, 2.350 | -0.700, 0.015, -1.175 | 0.700, 0.069, 1.175 | 1 |
| `ShellCluster` | 1.122, 0.260, 0.717 | -0.561, 0.010, -0.443 | 0.561, 0.270, 0.273 | 1 |
| `DriftwoodLog` | 2.952, 0.550, 0.840 | -1.476, 0.025, -0.264 | 1.476, 0.575, 0.576 | 1 |
| `TrashCan` | 0.700, 1.037, 0.700 | -0.350, 0.025, -0.350 | 0.350, 1.062, 0.350 | 1 |
| `WayfindingSign` | 1.900, 2.840, 0.600 | -0.850, 0.010, -0.300 | 1.050, 2.850, 0.300 | 1 |
| `PlanChest` | 2.650, 1.165, 1.425 | -1.325, 0.050, -0.700 | 1.325, 1.215, 0.725 | 1 |
| `Pergola` | 8.236, 4.750, 6.100 | -4.118, 0.050, -3.050 | 4.118, 4.800, 3.050 | 1 |
| `SisalRug` | 7.000, 0.050, 5.500 | -3.500, 0.025, -2.750 | 3.500, 0.075, 2.750 | 1 |
| `CampfireRing` | 2.524, 0.450, 2.500 | -1.257, 0.010, -1.250 | 1.267, 0.460, 1.250 | 1 |
| `Kayak` | 2.681, 0.740, 3.573 | -1.341, 0.050, -1.786 | 1.341, 0.790, 1.786 | 1 |
| `UmbrellaStand` | 0.600, 1.555, 0.600 | -0.300, 0.030, -0.300 | 0.300, 1.585, 0.300 | 1 |

### cubicle.glb

Default scene 0; 13 direct root nodes; 1 materials; generator `Khronos glTF Blender I/O v4.5.48`.

| Root node | Width × Height × Depth | Min XYZ | Max XYZ | Primitives |
|---|---|---|---|---:|
| `CubicleFloor` | 8.500, 0.150, 8.000 | -4.250, 0.025, -4.000 | 4.250, 0.175, 4.000 | 1 |
| `FloorInlay` | 8.000, 0.030, 7.500 | -4.000, 0.175, -3.750 | 4.000, 0.205, 3.750 | 1 |
| `PartitionBack` | 8.500, 1.800, 0.212 | -4.250, 0.140, -4.000 | 4.250, 1.940, -3.788 | 1 |
| `TrimBack` | 8.500, 1.930, 0.250 | -4.250, 0.130, -4.025 | 4.250, 2.060, -3.775 | 1 |
| `PartitionLeft` | 0.212, 1.800, 7.800 | -4.350, 0.140, -3.900 | -4.138, 1.940, 3.900 | 1 |
| `TrimLeft` | 0.250, 1.930, 7.800 | -4.375, 0.130, -3.900 | -4.125, 2.060, 3.900 | 1 |
| `PartitionRight` | 0.212, 1.800, 7.800 | 4.138, 0.140, -3.900 | 4.350, 1.940, 3.900 | 1 |
| `TrimRight` | 0.250, 1.930, 7.800 | 4.125, 0.130, -3.900 | 4.375, 2.060, 3.900 | 1 |
| `DeskTop` | 2.800, 0.217, 1.350 | -1.400, 0.993, -1.675 | 1.400, 1.210, -0.325 | 1 |
| `DeskFrame` | 2.635, 1.000, 1.349 | -1.340, 0.100, -1.665 | 1.295, 1.100, -0.317 | 1 |
| `Monitor` | 1.300, 0.900, 0.300 | -0.650, 1.200, -1.340 | 0.650, 2.100, -1.040 | 1 |
| `InputDevices` | 1.050, 0.089, 0.313 | -0.360, 1.213, -0.710 | 0.690, 1.302, -0.397 | 1 |
| `Chair` | 1.063, 1.596, 1.007 | -0.502, 0.067, 0.001 | 0.561, 1.664, 1.008 | 1 |

### foundation.glb

Default scene 0; 7 direct root nodes; 10 materials; generator `Cubicles library adapter — Higgsfield revision 6`.

| Root node | Width × Height × Depth | Min XYZ | Max XYZ | Primitives |
|---|---|---|---|---:|
| `HF_CubiclePanel_Corner` | 2.100, 1.440, 2.100 | -1.050, 0.000, -1.050 | 1.050, 1.440, 1.050 | 1 |
| `HF_CubiclePanel_GlassTop` | 2.430, 1.475, 0.130 | -1.215, 0.000, -0.065 | 1.215, 1.475, 0.065 | 3 |
| `HF_CubiclePanel_Straight` | 2.430, 1.470, 0.140 | -1.215, 0.000, -0.070 | 1.215, 1.470, 0.070 | 2 |
| `HF_Desk_Classic` | 1.600, 0.777, 0.750 | -0.800, 0.000, -0.375 | 0.800, 0.777, 0.375 | 2 |
| `HF_Desk_Standing` | 1.840, 1.042, 0.720 | -0.920, 0.000, -0.360 | 0.920, 1.042, 0.360 | 2 |
| `HF_RoomDividerScreen` | 1.698, 1.450, 0.060 | -0.849, 0.000, -0.030 | 0.849, 1.450, 0.030 | 4 |
| `HF_Table_Coffee` | 1.100, 0.458, 0.620 | -0.550, 0.000, -0.310 | 0.550, 0.458, 0.310 | 2 |

### seating.glb

Default scene 0; 11 direct root nodes; 14 materials; generator `Cubicles library adapter — Higgsfield revision 6`.

| Root node | Width × Height × Depth | Min XYZ | Max XYZ | Primitives |
|---|---|---|---|---:|
| `HF_Chair_Lounge` | 0.880, 1.077, 0.772 | -0.440, 0.000, -0.386 | 0.440, 1.077, 0.386 | 2 |
| `HF_Chair_Task` | 0.704, 1.117, 0.739 | -0.352, 0.000, -0.370 | 0.352, 1.117, 0.370 | 3 |
| `HF_Chair_Visitor` | 0.560, 1.128, 0.582 | -0.280, 0.000, -0.291 | 0.280, 1.128, 0.291 | 2 |
| `HF_BeanBag` | 0.859, 0.960, 0.817 | -0.429, 0.000, -0.408 | 0.429, 0.960, 0.408 | 1 |
| `HF_Pouf` | 0.840, 0.460, 0.840 | -0.420, 0.000, -0.420 | 0.420, 0.460, 0.420 | 1 |
| `HF_GamingChair` | 1.010, 1.312, 0.853 | -0.505, 0.000, -0.427 | 0.505, 1.312, 0.427 | 3 |
| `HF_Stool` | 0.805, 0.453, 0.846 | -0.402, 0.000, -0.423 | 0.402, 0.453, 0.423 | 2 |
| `HF_Ottoman` | 0.460, 0.220, 0.380 | -0.230, 0.000, -0.190 | 0.230, 0.220, 0.190 | 1 |
| `HF_Bench` | 1.260, 0.390, 0.280 | -0.630, 0.000, -0.140 | 0.630, 0.390, 0.140 | 2 |
| `HF_Loveseat` | 1.580, 0.690, 0.635 | -0.790, 0.000, -0.318 | 0.790, 0.690, 0.318 | 2 |
| `HF_Sofa_TwoSeat` | 1.740, 0.979, 0.806 | -0.870, 0.000, -0.403 | 0.870, 0.979, 0.403 | 2 |

### tech.glb

Default scene 0; 27 direct root nodes; 18 materials; generator `Cubicles library adapter — Higgsfield revision 6`.

| Root node | Width × Height × Depth | Min XYZ | Max XYZ | Primitives |
|---|---|---|---|---:|
| `HF_Headphones` | 0.590, 0.522, 0.120 | -0.295, 0.000, -0.060 | 0.295, 0.522, 0.060 | 2 |
| `HF_Keyboard_Mouse` | 0.940, 0.086, 0.270 | -0.470, 0.000, -0.135 | 0.470, 0.086, 0.135 | 2 |
| `HF_Laptop_Open` | 0.680, 0.562, 0.500 | -0.340, 0.000, -0.250 | 0.340, 0.562, 0.250 | 3 |
| `HF_Monitor_Standard` | 0.740, 0.640, 0.200 | -0.370, 0.000, -0.100 | 0.370, 0.640, 0.100 | 3 |
| `HF_Monitor_Ultrawide` | 1.080, 0.610, 0.200 | -0.540, 0.000, -0.100 | 0.540, 0.610, 0.100 | 3 |
| `HF_MousepadLarge` | 0.600, 0.018, 0.350 | -0.300, 0.000, -0.175 | 0.300, 0.018, 0.175 | 1 |
| `HF_MechanicalKeyboard` | 0.855, 0.102, 0.222 | -0.428, 0.000, -0.111 | 0.428, 0.102, 0.111 | 4 |
| `HF_CompactKeyboard` | 0.608, 0.102, 0.222 | -0.304, 0.000, -0.111 | 0.304, 0.102, 0.111 | 4 |
| `HF_TrackballMouse` | 0.322, 0.370, 0.306 | -0.161, 0.000, -0.153 | 0.161, 0.370, 0.153 | 2 |
| `HF_Tablet` | 0.320, 0.042, 0.230 | -0.160, 0.000, -0.115 | 0.160, 0.042, 0.115 | 2 |
| `HF_Webcam` | 0.200, 0.200, 0.142 | -0.100, 0.000, -0.071 | 0.100, 0.200, 0.071 | 3 |
| `HF_HeadphoneStand` | 0.450, 0.905, 0.180 | -0.225, 0.000, -0.090 | 0.225, 0.905, 0.090 | 3 |
| `HF_TripleMonitorRig` | 1.920, 0.900, 0.100 | -0.960, 0.000, -0.050 | 0.960, 0.900, 0.050 | 2 |
| `HF_UltrawideMonitor` | 0.720, 0.718, 0.147 | -0.360, 0.000, -0.073 | 0.360, 0.718, 0.073 | 2 |
| `HF_VerticalMonitorRig` | 0.800, 0.900, 0.100 | -0.400, 0.000, -0.050 | 0.400, 0.900, 0.050 | 2 |
| `HF_MiniPCTower` | 0.250, 0.320, 0.466 | -0.125, 0.000, -0.233 | 0.125, 0.320, 0.233 | 3 |
| `HF_DesktopTower` | 0.320, 0.738, 0.646 | -0.160, 0.000, -0.323 | 0.160, 0.738, 0.323 | 3 |
| `HF_MacroPad` | 0.370, 0.107, 0.260 | -0.185, 0.000, -0.130 | 0.185, 0.107, 0.130 | 4 |
| `HF_PortableSSDStack` | 0.257, 0.305, 0.186 | -0.128, 0.000, -0.093 | 0.128, 0.305, 0.093 | 4 |
| `HF_Router` | 0.470, 0.532, 0.235 | -0.235, 0.000, -0.117 | 0.235, 0.532, 0.117 | 1 |
| `HF_NASMini` | 0.300, 0.417, 0.466 | -0.150, 0.000, -0.233 | 0.150, 0.417, 0.233 | 3 |
| `HF_CableHub` | 0.435, 0.065, 0.316 | -0.217, 0.000, -0.158 | 0.217, 0.065, 0.158 | 2 |
| `HF_AudioInterface` | 0.450, 0.095, 0.388 | -0.225, 0.000, -0.194 | 0.225, 0.095, 0.194 | 2 |
| `HF_MIDIPad` | 0.670, 0.125, 0.470 | -0.335, 0.000, -0.235 | 0.335, 0.125, 0.235 | 5 |
| `HF_MixingConsole` | 1.067, 0.190, 0.400 | -0.533, 0.000, -0.200 | 0.533, 0.190, 0.200 | 4 |
| `HF_DrawingTablet` | 1.005, 0.089, 0.340 | -0.502, 0.000, -0.170 | 0.502, 0.089, 0.170 | 3 |
| `HF_Speakers_Pair` | 0.740, 0.400, 0.255 | -0.370, 0.000, -0.128 | 0.370, 0.400, 0.128 | 2 |

### greenery.glb

Default scene 0; 12 direct root nodes; 13 materials; generator `Cubicles library adapter — Higgsfield revision 6`.

| Root node | Width × Height × Depth | Min XYZ | Max XYZ | Primitives |
|---|---|---|---|---:|
| `HF_Plant_Cactus` | 0.460, 0.740, 0.460 | -0.230, 0.000, -0.230 | 0.230, 0.740, 0.230 | 2 |
| `HF_Plant_Desk` | 0.553, 0.596, 0.362 | -0.276, 0.000, -0.181 | 0.276, 0.596, 0.181 | 3 |
| `HF_Plant_Floor` | 0.659, 0.923, 0.460 | -0.330, 0.000, -0.230 | 0.330, 0.923, 0.230 | 3 |
| `HF_HangingPlanter` | 0.508, 1.140, 0.502 | -0.254, 0.000, -0.251 | 0.254, 1.140, 0.251 | 3 |
| `HF_Pothos` | 0.554, 1.080, 0.542 | -0.277, 0.000, -0.271 | 0.277, 1.080, 0.271 | 2 |
| `HF_SnakePlant` | 0.784, 0.897, 0.480 | -0.392, 0.000, -0.240 | 0.392, 0.897, 0.240 | 2 |
| `HF_Monstera` | 0.814, 1.150, 0.760 | -0.407, 0.000, -0.380 | 0.407, 1.150, 0.380 | 2 |
| `HF_Bonsai` | 0.664, 1.070, 0.480 | -0.332, 0.000, -0.240 | 0.332, 1.070, 0.240 | 3 |
| `HF_Terrarium` | 0.543, 0.460, 0.320 | -0.272, 0.000, -0.160 | 0.272, 0.460, 0.160 | 3 |
| `HF_PlanterStand` | 0.552, 1.030, 0.560 | -0.276, 0.000, -0.280 | 0.276, 1.030, 0.280 | 3 |
| `HF_FlowerVase` | 0.467, 1.080, 0.470 | -0.234, 0.000, -0.235 | 0.234, 1.080, 0.235 | 5 |
| `HF_ZenTray` | 0.721, 0.188, 0.340 | -0.360, 0.000, -0.170 | 0.360, 0.188, 0.170 | 2 |

### lighting.glb

Default scene 0; 12 direct root nodes; 18 materials; generator `Cubicles library adapter — Higgsfield revision 6`.

| Root node | Width × Height × Depth | Min XYZ | Max XYZ | Primitives |
|---|---|---|---|---:|
| `HF_Lamp_Desk` | 0.671, 1.034, 0.400 | -0.335, 0.000, -0.200 | 0.335, 1.034, 0.200 | 2 |
| `HF_Lamp_Floor` | 0.533, 1.802, 0.560 | -0.266, 0.000, -0.280 | 0.266, 1.802, 0.280 | 2 |
| `HF_Lamp_Pendant` | 0.571, 1.310, 0.600 | -0.285, 0.000, -0.300 | 0.285, 1.310, 0.300 | 2 |
| `HF_HighlighterSet` | 0.655, 0.045, 0.180 | -0.328, 0.000, -0.090 | 0.328, 0.045, 0.090 | 5 |
| `HF_RingLight` | 0.830, 1.440, 0.260 | -0.415, 0.000, -0.130 | 0.415, 1.440, 0.130 | 2 |
| `HF_OnAirLight` | 0.340, 0.200, 0.168 | -0.170, 0.000, -0.084 | 0.170, 0.200, 0.084 | 2 |
| `HF_MushroomLamp` | 0.709, 0.790, 0.720 | -0.355, 0.000, -0.360 | 0.355, 0.790, 0.360 | 2 |
| `HF_PaperLantern` | 0.680, 1.430, 0.646 | -0.340, 0.000, -0.323 | 0.340, 1.430, 0.323 | 2 |
| `HF_FairyLightString` | 1.563, 0.386, 0.060 | -0.781, 0.000, -0.030 | 0.781, 0.386, 0.030 | 3 |
| `HF_CandleSet` | 0.715, 0.515, 0.200 | -0.357, 0.000, -0.100 | 0.357, 0.515, 0.100 | 4 |
| `HF_SoftboxLight` | 0.567, 1.350, 0.654 | -0.284, 0.000, -0.327 | 0.284, 1.350, 0.327 | 2 |
| `HF_LavaLamp` | 0.360, 0.980, 0.360 | -0.180, 0.000, -0.180 | 0.180, 0.980, 0.180 | 3 |

### decor.glb

Default scene 0; 16 direct root nodes; 18 materials; generator `Cubicles library adapter — Higgsfield revision 6`.

| Root node | Width × Height × Depth | Min XYZ | Max XYZ | Primitives |
|---|---|---|---|---:|
| `HF_Corkboard` | 1.550, 1.030, 0.090 | -0.775, 0.000, -0.045 | 0.775, 1.030, 0.045 | 2 |
| `HF_DeskClock` | 0.400, 0.400, 0.118 | -0.200, 0.000, -0.059 | 0.200, 0.400, 0.059 | 3 |
| `HF_Pegboard` | 1.036, 0.576, 0.110 | -0.518, 0.000, -0.055 | 0.518, 0.576, 0.055 | 2 |
| `HF_GlassWhiteboard` | 1.240, 1.085, 0.099 | -0.620, 0.000, -0.049 | 0.620, 1.085, 0.049 | 6 |
| `HF_KanbanBoard` | 1.240, 1.085, 0.099 | -0.620, 0.000, -0.049 | 0.620, 1.085, 0.049 | 6 |
| `HF_RoadmapBoard` | 1.240, 1.085, 0.099 | -0.620, 0.000, -0.049 | 0.620, 1.085, 0.049 | 6 |
| `HF_Moodboard` | 1.240, 1.085, 0.099 | -0.620, 0.000, -0.049 | 0.620, 1.085, 0.049 | 6 |
| `HF_WallClock` | 0.760, 0.760, 0.133 | -0.380, 0.000, -0.066 | 0.380, 0.760, 0.066 | 3 |
| `HF_StandingMat` | 0.580, 0.025, 0.400 | -0.290, 0.000, -0.200 | 0.290, 0.025, 0.200 | 1 |
| `HF_StandingMirror` | 0.500, 1.215, 0.291 | -0.250, 0.000, -0.146 | 0.250, 1.215, 0.146 | 3 |
| `HF_GreenScreen` | 1.550, 1.475, 0.050 | -0.775, 0.000, -0.025 | 0.775, 1.475, 0.025 | 2 |
| `HF_AcousticPanelSet` | 1.160, 0.880, 0.060 | -0.580, 0.000, -0.030 | 0.580, 0.880, 0.030 | 3 |
| `HF_CustomSignFrame` | 0.720, 0.420, 0.114 | -0.360, 0.000, -0.057 | 0.360, 0.420, 0.057 | 3 |
| `HF_Rug_Rounded` | 1.800, 0.060, 1.200 | -0.900, 0.000, -0.600 | 0.900, 0.060, 0.600 | 2 |
| `HF_WallArt_Abstract` | 1.020, 1.300, 0.132 | -0.510, 0.000, -0.066 | 0.510, 1.300, 0.066 | 4 |
| `HF_Whiteboard` | 1.780, 1.120, 0.092 | -0.890, 0.000, -0.046 | 0.890, 1.120, 0.046 | 2 |

### desk-details.glb

Default scene 0; 32 direct root nodes; 26 materials; generator `Cubicles library adapter — Higgsfield revision 6`.

| Root node | Width × Height × Depth | Min XYZ | Max XYZ | Primitives |
|---|---|---|---|---:|
| `HF_Bin_Recycle` | 0.600, 0.838, 0.500 | -0.300, 0.000, -0.250 | 0.300, 0.838, 0.250 | 3 |
| `HF_Bin_Waste` | 0.560, 0.715, 0.560 | -0.280, 0.000, -0.280 | 0.280, 0.715, 0.280 | 2 |
| `HF_DeskProps_Personality` | 1.013, 0.310, 0.590 | -0.507, 0.000, -0.295 | 0.507, 0.310, 0.295 | 5 |
| `HF_StickyNotesCluster` | 0.490, 0.040, 0.390 | -0.245, 0.000, -0.195 | 0.245, 0.040, 0.195 | 3 |
| `HF_PenCup` | 0.280, 0.605, 0.280 | -0.140, 0.000, -0.140 | 0.140, 0.605, 0.140 | 4 |
| `HF_Stapler` | 0.260, 0.134, 0.080 | -0.130, 0.000, -0.040 | 0.130, 0.134, 0.040 | 2 |
| `HF_TapeDispenser` | 0.320, 0.285, 0.120 | -0.160, 0.000, -0.060 | 0.160, 0.285, 0.060 | 2 |
| `HF_Scissors` | 0.316, 0.032, 0.409 | -0.158, 0.000, -0.204 | 0.158, 0.032, 0.204 | 2 |
| `HF_DeskOrganizer` | 0.360, 0.240, 0.295 | -0.180, 0.000, -0.147 | 0.180, 0.240, 0.147 | 2 |
| `HF_PhoneStand` | 0.180, 0.377, 0.181 | -0.090, 0.000, -0.090 | 0.090, 0.377, 0.090 | 2 |
| `HF_ChargingDock` | 0.390, 0.075, 0.130 | -0.195, 0.000, -0.065 | 0.195, 0.075, 0.065 | 2 |
| `HF_BoomMicrophone` | 0.710, 0.865, 0.340 | -0.355, 0.000, -0.170 | 0.355, 0.865, 0.170 | 2 |
| `HF_DeskFan` | 0.476, 0.698, 0.160 | -0.238, 0.000, -0.080 | 0.238, 0.698, 0.080 | 2 |
| `HF_CoasterSet` | 0.580, 0.018, 0.130 | -0.290, 0.000, -0.065 | 0.290, 0.018, 0.065 | 4 |
| `HF_WaterBottle` | 0.240, 0.560, 0.240 | -0.120, 0.000, -0.120 | 0.120, 0.560, 0.120 | 2 |
| `HF_ShakerBottle` | 0.300, 0.560, 0.300 | -0.150, 0.000, -0.150 | 0.150, 0.560, 0.150 | 1 |
| `HF_SnackBowl` | 0.480, 0.290, 0.480 | -0.240, 0.000, -0.240 | 0.240, 0.290, 0.240 | 3 |
| `HF_CandyJar` | 0.380, 0.480, 0.380 | -0.190, 0.000, -0.190 | 0.190, 0.480, 0.190 | 5 |
| `HF_TissueBox` | 0.250, 0.302, 0.160 | -0.125, 0.000, -0.080 | 0.125, 0.302, 0.080 | 2 |
| `HF_CalendarBlock` | 0.280, 0.160, 0.288 | -0.140, 0.000, -0.144 | 0.140, 0.160, 0.144 | 2 |
| `HF_Nameplate` | 0.320, 0.272, 0.139 | -0.160, 0.000, -0.070 | 0.160, 0.272, 0.070 | 2 |
| `HF_LEDTicker` | 1.075, 0.160, 0.120 | -0.537, 0.000, -0.060 | 0.537, 0.160, 0.060 | 4 |
| `HF_UmbrellaStand` | 0.429, 1.145, 0.440 | -0.214, 0.000, -0.220 | 0.214, 1.145, 0.220 | 5 |
| `HF_LEDStripFrame` | 1.420, 1.220, 0.020 | -0.710, 0.000, -0.010 | 0.710, 1.220, 0.010 | 1 |
| `HF_Diffuser` | 0.292, 1.040, 0.300 | -0.146, 0.000, -0.150 | 0.146, 1.040, 0.150 | 2 |
| `HF_WovenBasket` | 0.750, 1.000, 0.750 | -0.375, 0.000, -0.375 | 0.375, 1.000, 0.375 | 2 |
| `HF_DecorativeVase` | 0.473, 0.840, 0.480 | -0.236, 0.000, -0.240 | 0.236, 0.840, 0.240 | 1 |
| `HF_SculptureAbstract` | 0.880, 0.880, 0.476 | -0.440, 0.000, -0.238 | 0.440, 0.880, 0.238 | 3 |
| `HF_CameraTripod` | 0.399, 1.155, 0.459 | -0.200, 0.000, -0.230 | 0.200, 1.155, 0.230 | 2 |
| `HF_TrafficCone` | 0.600, 0.820, 0.600 | -0.300, 0.000, -0.300 | 0.300, 0.820, 0.300 | 3 |
| `HF_RecordPlayer` | 0.693, 0.302, 0.480 | -0.347, 0.000, -0.240 | 0.347, 0.302, 0.240 | 4 |
| `HF_DisplayPedestal` | 0.480, 1.135, 0.480 | -0.240, 0.000, -0.240 | 0.240, 1.135, 0.240 | 3 |

### coffee.glb

Default scene 0; 5 direct root nodes; 12 materials; generator `Cubicles library adapter — Higgsfield revision 6`.

| Root node | Width × Height × Depth | Min XYZ | Max XYZ | Primitives |
|---|---|---|---|---:|
| `HF_CoffeeMachine` | 0.460, 0.680, 0.540 | -0.230, 0.000, -0.270 | 0.230, 0.680, 0.270 | 4 |
| `HF_MiniFridge` | 0.700, 1.000, 0.675 | -0.350, 0.000, -0.338 | 0.350, 1.000, 0.338 | 3 |
| `HF_EspressoMachinePremium` | 0.558, 0.600, 0.700 | -0.279, 0.000, -0.350 | 0.279, 0.600, 0.350 | 2 |
| `HF_VendingMachine` | 0.860, 2.040, 0.738 | -0.430, 0.000, -0.369 | 0.430, 2.040, 0.369 | 5 |
| `HF_WaterCooler` | 0.480, 1.660, 0.478 | -0.240, 0.000, -0.239 | 0.240, 1.660, 0.239 | 3 |

### personality.glb

Default scene 0; 10 direct root nodes; 14 materials; generator `Cubicles library adapter — Higgsfield revision 6`.

| Root node | Width × Height × Depth | Min XYZ | Max XYZ | Primitives |
|---|---|---|---|---:|
| `HF_StartupKPIBoard` | 1.665, 0.550, 0.098 | -0.833, 0.000, -0.049 | 0.833, 0.550, 0.049 | 7 |
| `HF_FundraisingBoard` | 1.665, 0.698, 0.101 | -0.833, 0.000, -0.050 | 0.833, 0.698, 0.050 | 6 |
| `HF_LaunchCountdown` | 0.800, 0.340, 0.166 | -0.400, 0.000, -0.083 | 0.400, 0.340, 0.083 | 2 |
| `HF_EnergyDrinkStack` | 0.546, 0.700, 0.350 | -0.273, 0.000, -0.175 | 0.273, 0.700, 0.175 | 3 |
| `HF_RubberDuckArmy` | 1.037, 0.330, 0.624 | -0.518, 0.000, -0.312 | 0.518, 0.330, 0.312 | 2 |
| `HF_BigRedButton` | 0.394, 0.280, 0.400 | -0.197, 0.000, -0.200 | 0.197, 0.280, 0.200 | 2 |
| `HF_PetRock` | 0.394, 0.440, 0.408 | -0.197, 0.000, -0.204 | 0.197, 0.440, 0.204 | 3 |
| `HF_BugGraveyardBoard` | 1.665, 0.550, 0.131 | -0.833, 0.000, -0.066 | 0.833, 0.550, 0.066 | 3 |
| `HF_MiniArcade` | 0.420, 0.580, 0.698 | -0.210, 0.000, -0.349 | 0.210, 0.580, 0.349 | 4 |
| `HF_RetroHandheld` | 0.437, 0.125, 0.210 | -0.219, 0.000, -0.105 | 0.219, 0.125, 0.105 | 3 |
