import type { Group } from 'three';
import { applyBlenderCatAsset, hasBlenderCatAsset, preloadBlenderCatAsset, registerBlenderCatAsset } from './blender-cat-asset';

// Preserve the original Choco entry points for existing callers.
export const registerChocoAsset = (scene: Group) => registerBlenderCatAsset('choco', scene);
export const preloadChocoAsset = () => preloadBlenderCatAsset('choco');
export const hasChocoAsset = () => hasBlenderCatAsset('choco');
export const applyChocoAsset = (root: Group) => applyBlenderCatAsset('choco', root);
