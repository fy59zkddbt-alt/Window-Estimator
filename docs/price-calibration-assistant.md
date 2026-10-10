# Price Calibration Assistant — Feature 7

Settings v2 PVC profile cards open a three-step assistant: profile/hardware and
instructions, manufacturer quotes, review and explicit Apply. It never enters
the measurement flow. The reference is a single-section PVC product 1000×1000 mm:
fixed white base versus fully active white, fixed one-side lamination, fixed
two-side lamination and fixed white with extensions. Each quote must change only
one option; dimensions, glass and other supplier conditions must stay identical.
Quotes exclude installation and the estimator's commercial product markup.

The application helper derives existing configuration coefficients, not customer
prices. With total area A and known active area Aa (both 1 m² for this reference):

- basePricePerM2 = baseQuote / A;
- activityPercent = (activeQuote − baseQuote) / (basePricePerM2 × Aa) × 100;
- each lamination or extension percentage independently equals
  (optionQuote − baseQuote) / (basePricePerM2 × A) × 100.

Quote strings use the existing exact RUB-to-minor parser (at most two decimal
places, decimal point or comma). Transient BigInt ratios avoid subtraction/division
tails. Percentages use six decimal places, half-up. Base derivation explicitly
uses reference area; at the fixed 1 m² reference it retains the entered kopecks.
No commercial rounding is called. Inputs and outputs are checked for positive
quotes, nonnegative coefficients and safe range; the proposed Settings v2 object
passes the canonical validator before review and again on Apply. BigInts and
quotes are never persisted.

The target hardware must already belong to the selected PVC profile; only that
relation's activity changes. Base, selected lamination colorRules and extensions
belong to the profile. Existing lamination variants are selected explicitly so
multiple catalog colors cannot be silently conflated. A supplied lamination
quote requires a matching configured active color rule. The base reference
requires a configured active unlaminated color with zero surcharge. If these
are absent, configure them using the ordinary Settings form first; the assistant
does not create catalog entries or assume a hidden coefficient.

Only base is required. Blank optional quotes preserve existing fields. Review,
Back and Cancel do not mutate Settings. Explicit Apply returns a new ordinary
Settings v2 draft, preserving other profiles, hardware, colors, connectors,
product markup, installation, finishing, works, defaults and confirmation.
There is no storage dependency. Ordinary Save continues through the Feature 6
owner/revision-protected cloud and user-scoped Dexie path. Apply and Save preserve
pricesConfirmed; only the existing explicit “Цены проверены” action confirms.

Feature 3 pricing, starter configuration, production Calculation and legacy
calculator rates are unchanged. The controlled transition belongs to Feature 8.

Verification:

- `pnpm test --maxWorkers=2 tests/price-calibration.test.tsx` for derivation,
  isolation, input errors, precision and confirmation/persistence commands.
- Start `pnpm dev --host 127.0.0.1`, then run
  `node tests/browser/price-calibration.cjs` with Playwright installed locally or
  `PLAYWRIGHT_MODULE` pointing to the host's bundled module. Headless Edge is the
  default; `CALIBRATION_BROWSER_CHANNEL` and `CALIBRATION_URL` can override it.
  The fixture uses no production storage/auth. It checks actual navigation,
  review/back/cancel/apply/save, profile/hardware isolation, confirmation,
  375 px overflow and 48 px control targets.
