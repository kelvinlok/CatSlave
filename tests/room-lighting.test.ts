import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RoomLighting, sampleLocalDaylight } from '../src/room-lighting';
import { Game } from '../src/simulation';
import { World } from '../src/world';

const at = (hours: number, minutes = 0) => new Date(2026, 10, 3, hours, minutes);

describe('device-local room lighting', () => {
  it('lights the Pawdicure face from the front, preserves it on pause, then restores normal play', () => {
    const game = new Game(42), world = new World(); world.resize(390, 844);
    const key = world.lighting.indoorLights.find(light => light.name === 'Indoor | track light 5.8') as THREE.SpotLight;
    const original = { target: key.target.position.toArray(), intensity: key.intensity, angle: key.angle, penumbra: key.penumbra };
    game.startPawdicurePractice(); world.update(game, 0, 0);
    const face = new THREE.Vector3(0, 2.5, .55);
    expect(key.position.z).toBeGreaterThan(face.z);
    expect(key.target.position.distanceTo(face)).toBeLessThan(.01);
    expect(key.intensity).toBeGreaterThan(original.intensity);
    game.pause(); world.update(game, 0, 0);
    expect(key.target.position.distanceTo(face)).toBeLessThan(.01);
    game.reset(); world.update(game, 0, 0);
    expect({ target: key.target.position.toArray(), intensity: key.intensity, angle: key.angle, penumbra: key.penumbra }).toEqual(original);
  });

  it('covers all the entrance lettering with the bright inner part of the spotlight', () => {
    const lighting = new RoomLighting(new THREE.Scene(), new THREE.Group());
    const light = lighting.indoorLights.find(light => light.name === 'Indoor | entrance logo light') as THREE.SpotLight;
    const center = light.target.position, axis = center.clone().sub(light.position).normalize();
    // The authored logo is 2.3 m wide and about .7 m high on the left wall.
    for (const y of [-.36, .36]) for (const z of [-1.16, 1.16]) {
      const corner = center.clone().add(new THREE.Vector3(0, y, z));
      const direction = corner.sub(light.position);
      expect(direction.length()).toBeLessThan(light.distance);
      expect(direction.angleTo(axis)).toBeLessThan(light.angle * (1 - light.penumbra));
    }
  });

  it('uses local clock hours and smooth dawn and dusk, without an accelerated game clock', () => {
    expect(sampleLocalDaylight(at(12)).daylight).toBe(1);
    expect(sampleLocalDaylight(at(0)).daylight).toBe(0);
    expect(sampleLocalDaylight(at(23)).daylight).toBe(0);
    expect(sampleLocalDaylight(at(6, 30)).daylight).toBeGreaterThan(0);
    expect(sampleLocalDaylight(at(6, 30)).daylight).toBeLessThan(sampleLocalDaylight(at(7)).daylight);
    expect(sampleLocalDaylight(at(18)).daylight).toBeGreaterThan(sampleLocalDaylight(at(18, 30)).daylight);
  });

  it('keeps real indoor lights on when daylight turns off and the clock jumps backward', () => {
    const scene = new THREE.Scene(), room = new THREE.Group();
    const lighting = new RoomLighting(scene, room);
    lighting.update(at(12).valueOf());
    const indoor = lighting.indoorLights.map(light => light.intensity);
    expect(lighting.daylight.intensity).toBeGreaterThan(1);
    lighting.update(at(23).valueOf());
    expect(lighting.daylight.intensity).toBe(0);
    expect(lighting.indoorLights.map(light => light.intensity)).toEqual(indoor);
    expect(indoor.every(intensity => intensity > 0)).toBe(true);
    expect(lighting.indoorLights.some(light => light instanceof THREE.SpotLight)).toBe(true);
    lighting.update(at(7).valueOf());
    expect(lighting.state.localHour).toBe(7);
    expect(lighting.daylight.intensity).toBeGreaterThan(0);
  });

  it('applies night to late-loaded city materials immediately, even within the same second', () => {
    const room = new THREE.Group(), lighting = new RoomLighting(new THREE.Scene(), room);
    const midnight = at(0).valueOf(); lighting.update(midnight);
    const original = new THREE.MeshStandardMaterial({ color: '#78909c' }); original.name = 'Exterior | lit windows';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), original);room.add(mesh);room.userData.loaded = true;
    const unlit = new THREE.MeshStandardMaterial(); unlit.name = 'Exterior | unlit windows';
    const darkWindow = new THREE.Mesh(new THREE.BoxGeometry(), unlit); room.add(darkWindow);
    lighting.update(midnight);
    expect(mesh.material).not.toBe(original);
    expect(mesh.material.emissiveIntensity).toBeGreaterThan(1);
    expect(darkWindow.material.emissive.getHex()).toBe(0);
    expect(original.emissive.getHex()).toBe(0);
    lighting.update(at(12).valueOf());
    expect(mesh.material.emissiveIntensity).toBe(0);
  });
});
