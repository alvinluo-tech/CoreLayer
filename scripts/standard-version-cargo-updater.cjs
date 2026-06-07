/**
 * standard-version custom updater for Cargo.toml.
 *
 * Reads and writes the `version = "x.y.z"` field in [package] section.
 */
module.exports = {
  readVersion(contents) {
    const match = contents.match(/^version\s*=\s*"([^"]+)"/m);
    if (!match) {
      throw new Error("Could not find version in Cargo.toml");
    }
    return match[1];
  },
  writeVersion(contents, version) {
    return contents.replace(
      /^version\s*=\s*"[^"]+"/m,
      `version = "${version}"`,
    );
  },
};
