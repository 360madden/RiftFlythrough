// Pure texture role classification helpers.

export function textureName(url) {
  return (url || "").split("?")[0].split("#")[0].split("/").pop().toLowerCase();
}

export function hasTextureToken(name, tokens) {
  return tokens.some((token) => {
    return name.includes(`_${token}_`) || name.includes(`_${token}.`) || name.includes(`-${token}.`);
  });
}

export function isNormalTexture(url) {
  const name = textureName(url);
  return name.includes("normal") || hasTextureToken(name, ["n", "normalgl"]);
}

export function isNonColorUtilityTexture(url) {
  const name = textureName(url);
  return (
    isNormalTexture(url) ||
    name.includes("spec") ||
    name.includes("gloss") ||
    name.includes("environmentmap") ||
    hasTextureToken(name, ["s", "g", "rough", "metal"])
  );
}

export function isPreferredColorTexture(url) {
  const name = textureName(url);
  return (
    name.includes("diffuse") ||
    name.includes("color") ||
    name.includes("albedo") ||
    name.includes("pure_white") ||
    hasTextureToken(name, ["c", "d"])
  );
}

export function chooseTextureSet(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return { color: null, normal: null };

  const color = urls.find(isPreferredColorTexture) || urls.find((url) => !isNonColorUtilityTexture(url)) || null;
  const normal = urls.find(isNormalTexture) || null;
  return { color, normal };
}
