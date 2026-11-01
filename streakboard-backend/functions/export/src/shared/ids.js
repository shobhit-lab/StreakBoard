import { randomBytes } from 'node:crypto';
// Local unique-id helper so handlers stay free of SDK imports (and testable offline).
export const ID = { unique: () => randomBytes(9).toString('hex') };
