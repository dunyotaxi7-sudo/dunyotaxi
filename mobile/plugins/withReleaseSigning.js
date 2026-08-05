// Config plugin: wire an Android *release* signing config into the generated
// android/app/build.gradle, so `./gradlew bundleRelease` produces an upload-key
// signed AAB instead of the debug-signed default.
//
// Credentials are read at build time from ../credentials/keystore.properties
// (gitignored, never committed). If that file is absent the build silently
// falls back to the debug key, so a fresh clone still builds.
//
// Because this runs during `expo prebuild`, the signing config is re-applied on
// every prebuild — no manual build.gradle edits to lose.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "dunyoHasReleaseKeystore"; // idempotency guard

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg; // already applied

    // 1) Load the properties file and add a `release` signingConfig that reads
    //    from it. Inserted by opening the existing `signingConfigs {` block.
    const loader = `def dunyoKeystorePropsFile = rootProject.file("../credentials/keystore.properties")
    def dunyoKeystoreProps = new Properties()
    def ${MARKER} = dunyoKeystorePropsFile.exists()
    if (${MARKER}) { dunyoKeystoreProps.load(new FileInputStream(dunyoKeystorePropsFile)) }
    signingConfigs {
        release {
            if (${MARKER}) {
                storeFile rootProject.file("../" + dunyoKeystoreProps['storeFile'])
                storePassword dunyoKeystoreProps['storePassword']
                keyAlias dunyoKeystoreProps['keyAlias']
                keyPassword dunyoKeystoreProps['keyPassword']
            }
        }`;
    if (!src.includes("signingConfigs {")) {
      throw new Error("withReleaseSigning: `signingConfigs {` not found in build.gradle");
    }
    src = src.replace("signingConfigs {", loader);

    // 2) Point the release buildType at the release signing config (falling back
    //    to debug when no keystore is present). Anchored on the RN template's
    //    caution comment so we only touch the release block, not debug.
    const before = src;
    src = src.replace(
      /(signed-apk-android\.\s*\n\s*)signingConfig signingConfigs\.debug/,
      `$1signingConfig ${MARKER} ? signingConfigs.release : signingConfigs.debug`,
    );
    if (src === before) {
      throw new Error("withReleaseSigning: could not rewrite the release buildType signingConfig");
    }

    cfg.modResults.contents = src;
    return cfg;
  });
};
