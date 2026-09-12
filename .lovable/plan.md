# Fix pack import and disabled skill rolls

## What will change
- Normalize imported provenance values to the database’s supported source types. Unknown or AI-authored labels will safely become user-supplied content instead of failing the whole pack import.
- Validate and normalize visibility values at the same import boundary so malformed metadata cannot trigger another database constraint error.
- Support an explicit numeric skill level when imported character data provides `data.level` but lacks point-based skill configuration.
- Keep point-derived levels authoritative when points and attribute/difficulty configuration exist; never invent a fallback target.
- Show the explicit level as the roll target, enabling Roll for the affected imported skills.

## Verification
- Add regression tests for unsupported pack source labels and visibility values.
- Add rules tests confirming explicit imported skill levels are rollable while genuinely unconfigured skills remain disabled.
- Run focused tests, type checking, build checks, and authenticated browser verification on the affected character and pack import flow.

## Technical details
- Keep normalization in the portable import parser, before database writes.
- Keep explicit-level resolution in the pure rules engine, not the interface.
- No schema weakening, UI redesign, or unrelated feature work.
