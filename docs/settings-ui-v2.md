# Settings UI v2 — Feature 6

Supersedes only the Quick / Detailed settings UX in ux-pricing-spec-v1.2.md.
One vNext configuration and the Feature 3/4/5 engines remain canonical. Primary
fields are visible; native “Дополнительные параметры” disclosures contain rare
fields. Collapsing a disclosure never disables its values. No pricing mode,
second formula, reinforcement modifier or fixed quick price is introduced.

Stacked cards cover PVC profiles, profile × hardware activity, aluminium systems,
separate material installation rates, finishing widths/labor, Additional Works
catalog and common rounding (10/50/100 RUB). Essential explanations are inline.
Percentage illustrations show current base-derived additions per applicable m²;
they are display-only, approximate to two decimals, unpersisted and never used
as estimate inputs. Product markup is explained separately as a single final
markup on the product components. Installation has its own card and rate.

Lamination needs no contract change: colors already carry none/one_side/two_sides,
profiles carry independent colorRules, measurements select colorId. Starter now
includes both one-side (10%) and two-side (25%) variants. Existing snapshots are
not rewritten. Starter PVC is VEKA Softline 70, 5700 RUB/m², Mako activity 125%,
extensions 20%, product markup 40%. Aluminium base is 13000 RUB/m² and connectors
20%. Starter installation is 3000 RUB/m² for both PVC and aluminium, separate
from product pricing and unaffected by product/options markups. Existing example
sliding/swing (15/25), finish/labor and other unmentioned rates are preserved.
These are unconfirmed examples, not market claims. Production Settings v1 rates
are unchanged.

## Production boundary and persistence

Production remains Calculation v3 / legacy editor settings v1 until Feature 7.
The existing SettingsScreen caller in App now shows SettingsV2Form. A narrowly
scoped optional `settingsV2` member in the existing settings payload stages the
canonical CalculatorSettings v2. All existing v1 glazing/finish values are retained
and still consumed by createSettingsSnapshot. No conversion, calibration or
automatic propagation between these contracts occurs. The screen explains that
the current calculator still uses previous rates. Existing user v2 settings always
win over starter defaults; opening an absent v2 form creates only an in-memory
starter draft. There is no reset action or automatic starter write.

Save uses the same SettingsScreen callbacks → CloudSettingsSync → owner/revision
conditional Supabase update → user-scoped Dexie cache. The existing decoder/copy
validates and preserves the staged v2 member. Reload explicitly discards drafts;
offline and conflict failures retain drafts. No schema/index/RLS/auth changes.
This additive payload extension is temporary staging, not a second new engine.

Ordinary Save preserves pricesConfirmed, including false after edits. Only the
separate “Цены проверены” action calls confirmExamplePrices and saves through the
same callback. Local confirmation changes only after successful persistence.
Example origin/containsExamplePrices provenance remains intact. “Проверить цены”
shows review instructions; confirmation is at the end of the same settings form.
Works use the existing unitPriceMinor contract and optional units; catalog edits
cannot reprice Calculation work snapshots. Finishing reserve is fixed, with no
editable reserve, obsolete waste, purchase-step or material-markup controls.

No calculation migrations, data resets, calculator/editor transition, PDF work,
auth/subscription/payments changes or Feature 7 work are part of this feature.
