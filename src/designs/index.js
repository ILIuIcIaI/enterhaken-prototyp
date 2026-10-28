import { buildBelle } from './belle.js';
import { buildRei } from './rei.js';
import { buildMakima } from './makima.js';
import { buildZero } from './zero.js';
import { buildTwoB } from './twob.js';
import { buildJoker } from './joker.js';
import { buildMakoto } from './makoto.js';
import { buildSteve, STEVE_B } from './steve.js';
import { buildScientist } from './scientist.js';
import { buildJonesy } from './jonesy.js';

// Spielbare Figuren in der Reihenfolge des Auswahlrasters. Reine Optik – keine Spielvorteile.
// Jedes Design: id, name, franchise, optional Proportionen (B, HC, scale) und build(K).
export const ROSTER = [
  { id: 'belle', name: 'Belle', franchise: 'Zenless Zone Zero', build: buildBelle },
  { id: 'rei', name: 'Rei Ayanami', franchise: 'Neon Genesis Evangelion', scale: 0.97, AP: 0.34, build: buildRei },
  { id: 'makima', name: 'Makima', franchise: 'Chainsaw Man', scale: 1.07, AP: 0.34, build: buildMakima },
  { id: 'zero', name: 'Zero', franchise: 'Drakengard 3', scale: 1.03, AP: 0.34, build: buildZero },
  { id: '2b', name: '2B', franchise: 'NieR:Automata', scale: 1.02, AP: 0.34, build: buildTwoB },
  { id: 'joker', name: 'Joker', franchise: 'Persona 5', scale: 1.05, AP: 0.34, B: { shoulderX: 0.168, hipX: 0.088 }, build: buildJoker },
  { id: 'makoto', name: 'Makoto Yuki', franchise: 'Persona 3', scale: 1.04, AP: 0.34, B: { shoulderX: 0.16, hipX: 0.086 }, build: buildMakoto },
  { id: 'steve', name: 'Steve', franchise: 'Minecraft', B: STEVE_B, HC: [0, 1.62, 0], AP: 0, build: buildSteve },
  { id: 'scientist', name: 'Scientist', franchise: 'Half-Life', scale: 1.04, AP: 0.34, B: { shoulderX: 0.17, hipX: 0.09 }, build: buildScientist },
  { id: 'jonesy', name: 'Jonesy', franchise: 'Fortnite', scale: 1.08, AP: 0.34, B: { shoulderX: 0.178, hipX: 0.092 }, build: buildJonesy },
];

export function getDesign(id) {
  return ROSTER.find((d) => d.id === id) ?? ROSTER[0];
}
