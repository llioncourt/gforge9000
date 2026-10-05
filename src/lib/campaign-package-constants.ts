/**
 * Campaign package limits and enums, kept free of the schema library so the
 * format guide can be shown without loading the validator.
 */
export const MAX_CAMPAIGN_PACKAGE_BYTES = 500 * 1024 * 1024;

export const NOTE_KINDS = ["note", "handout", "session", "session-prep", "rule"] as const;
export const VISIBILITIES = ["gm", "players", "public"] as const;
export const GRID_TYPES = ["square", "hex", "none"] as const;
