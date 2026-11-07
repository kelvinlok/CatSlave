import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation';
import { PALETTE } from '../src/config';
import { roomMenuAction, roomMenuCapacity, roomMenuCats } from '../src/cat-rooms-menu';

const names = PALETTE.map(cat => cat.name);
function fixture(active: number) {
  const game = new Game(42);
  game.restoreFreePlay(names.slice(0, 5)); game.restoreAdoptedCats(names);
  game.restoreCatRooms({ version: 1, active: names.slice(0, active), rooms: [...names.slice(active), ...Array(active - 1).fill(null)] });
  game.startFreePlay();
  return game;
}

describe('cat-first room menu', () => {
  it('allows invitations with all eight bedrooms occupied and one lounge cat', () => {
    const game = fixture(1);
    expect(roomMenuCats(game, 'sleeping')).toHaveLength(8);
    expect(roomMenuAction(game, 1)).toMatchObject({ direction: 'wake', roomIndex: 0, enabled: true });
    expect(roomMenuAction(game, 0)).toMatchObject({ direction: 'sleep', enabled: false, reason: 'All rooms occupied' });
  });

  it('keeps other invitations available while a doorway is in use, until capacity is reserved', () => {
    const game = fixture(1);
    for (const index of [1, 3, 5, 7]) {
      const action = roomMenuAction(game, index);
      expect(action.enabled).toBe(true);
      expect(game.wakeRoomCat(action.roomIndex)).toBe(true);
    }
    expect(roomMenuCapacity(game)).toEqual({ inLounge: 1, arriving: 4, returning: 0, reserved: 5 });
    expect(roomMenuAction(game, 3)).toMatchObject({ enabled: false, reason: 'Waiting for doorway' });
    expect(roomMenuAction(game, 2)).toMatchObject({ enabled: false, reason: 'Lounge full — send a cat to bed first' });
    expect(roomMenuCats(game, 'lounge')).toHaveLength(5);
    expect(roomMenuCats(game, 'sleeping')).toHaveLength(4);
  });

  it('automatically chooses a vacant bed and explains pending departures at capacity', () => {
    const game = fixture(5), action = roomMenuAction(game, 0);
    expect(action).toMatchObject({ enabled: true, direction: 'sleep', roomIndex: 4 });
    expect(game.sendCatToRoom(action.cat!.id, action.roomIndex)).toBe(true);
    expect(roomMenuAction(game, 5)).toMatchObject({ enabled: false, reason: 'Wait for returning cats' });
    expect(roomMenuCapacity(game)).toEqual({ inLounge: 4, arriving: 0, returning: 1, reserved: 5 });
    expect(roomMenuCats(game, 'lounge')).toHaveLength(4);
    expect(roomMenuCats(game, 'sleeping')).toHaveLength(5);
  });
});
