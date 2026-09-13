// Single-player build — platform-required rules-module stub (the whole game runs client-side).
export const meta = { game: "apocalypse-meow", minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
