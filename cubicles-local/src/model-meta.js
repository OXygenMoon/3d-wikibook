export const MODEL_ITEM_PREFIX = 'model:';

export function canUseModel(asset, user) {
  if (asset.visibility === 'private') return asset.ownerId === user?.id;
  return asset.access !== 'reward' || user?.role === 'admin' || (user?.unlockedModelIds || []).includes(asset.id);
}

export function isModelItem(itemId) {
  return typeof itemId === 'string' && itemId.startsWith(MODEL_ITEM_PREFIX);
}

export function modelAssetId(itemId) {
  return isModelItem(itemId) ? itemId.slice(MODEL_ITEM_PREFIX.length) : null;
}

export function findAsset(assets, id) {
  return (assets || []).find(asset => asset.id === id) || null;
}

export function assetNativeMax(asset) {
  const values = [asset?.width, asset?.height, asset?.depth].map(Number).filter(value => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : 0;
}

/**
 * Model assets are normalized so scale = 1 means the longest side is 1 metre.
 * The server stores native bounds plus the chosen uniform scale.
 */
export function effectiveSize(asset) {
  const max = assetNativeMax(asset);
  const scale = Number(asset?.scale);
  if (!max || !Number.isFinite(scale) || scale <= 0) return { width: 1, height: 1, depth: 1 };
  return {
    width: (Number(asset.width) / max) * scale,
    height: (Number(asset.height) / max) * scale,
    depth: (Number(asset.depth) / max) * scale,
  };
}

export function effectiveFootprint(asset) {
  const size = effectiveSize(asset);
  return {
    width: Math.max(1, Math.ceil(size.width - 1e-6)),
    depth: Math.max(1, Math.ceil(size.depth - 1e-6)),
    size,
  };
}

export function formatModelSize(asset) {
  const size = effectiveSize(asset);
  return `${size.width.toFixed(2)} × ${size.height.toFixed(2)} × ${size.depth.toFixed(2)} 米`;
}
