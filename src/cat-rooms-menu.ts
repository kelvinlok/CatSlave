import { PALETTE } from './config';
import type { Game } from './simulation';

export function roomMenuCats(game: Game, group: 'lounge' | 'sleeping') {
  const cats = group === 'lounge' ? game.cats : game.roomSlots.filter(cat => !!cat);
  return cats.filter(cat => {
    const move = game.roomTransitions.find(item => item.catId === cat.id);
    return group === 'lounge' ? move?.direction !== 'sleep' : move?.direction !== 'wake';
  });
}

export function roomMenuCapacity(game: Game) {
  const arriving = game.roomTransitions.filter(item => item.direction === 'wake').length;
  const returning = game.roomTransitions.filter(item => item.direction === 'sleep').length;
  return { inLounge: game.cats.length - arriving - returning, arriving, returning, reserved: game.cats.length };
}

/** One selected cat determines the action; a separate room selection cannot veto it. */
export function roomMenuAction(game: Game, index: number) {
  const name = PALETTE[index]?.name;
  const active = game.cats.find(cat => cat.name === name);
  const occupied = name ? game.roomSlots.findIndex(cat => cat?.name === name) : -1;
  const cat = active ?? (occupied >= 0 ? game.roomSlots[occupied] : undefined);
  const move = cat && game.roomTransitions.find(item => item.catId === cat.id);
  let direction: 'sleep' | 'wake' | undefined;
  let roomIndex = occupied, reason = '', status = '';
  if (!cat) reason = 'Choose a cat';
  else if (move) {
    direction = move.direction;
    status = reason = move.phase === 'queued' ? 'Waiting for doorway' : move.direction === 'wake' ? 'Coming out…' : 'Returning…';
  } else if (occupied >= 0 && !active) {
    direction = 'wake'; status = 'Sleeping';
    if (game.cats.length >= 5) reason = roomMenuCapacity(game).returning ? 'Wait for returning cats' : 'Lounge full — send a cat to bed first';
  } else {
    direction = 'sleep'; status = 'In lounge';
    roomIndex = game.roomSlots.findIndex(cat => !cat);
    if (roomIndex < 0) reason = 'All rooms occupied';
  }
  return { cat, direction, roomIndex, enabled: !!cat && !reason, reason, status };
}
