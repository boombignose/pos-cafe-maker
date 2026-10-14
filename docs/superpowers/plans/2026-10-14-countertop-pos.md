# Countertop POS refinement

Scope: user approved refining the enclosure and cashier layout after comparison with commercial POS. Keep the demo, existing data and electronics prototype status. Publish a new patch release rather than replace old assets.

1. Use Waveshare 7inch HDMI LCD (C) published dimensions (164.90×106.96×8 mm, active154.21×85.92) as the documented starting reference. Connector locations and centered active-area placement still need measurement.
2. Keep one canonical generator and four print parts. Round enclosure corners; add lid-integrated rear screen stops, a rear pedestal with four matching mounting bores, and cable-tie slots. Check positive closed solids, fastening paths, electronics clearance, touchscreen access and several sizes.
3. Make the cashier shell compact, use text menu tiles, give cart/payment visible space at1024×600, keep touch controls and all navigation/actions available. Keep demo/provenance labels. Add a browser regression covering small-screen sale and options.
4. Update Thai assembly instructions, examples, screenshots, evidence, version and archives; run tests/build/hardware stale checks/browser checks; obtain whole-change review; publish source, Pages and ZIP release.

Acceptance: no default solid collisions, matching open bores, four closed STL files fitting the220mm bed, no false pinout/physical-fit claim, payment control visible at1024×600, existing checkout/refund tests pass, hosted new version and assets verified.

Existing user authorization includes GitHub publication through connected boombignose browser. CLI reconnection is deferred and is not required.
