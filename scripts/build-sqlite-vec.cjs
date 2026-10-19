// Prepare a reproducible Gradle/NDK build of sqlite-vec. npm install itself does
// not need an Android SDK, so iOS development and CI remain supported.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.dirname(require.resolve("expo-sqlite/package.json"));
if (require(path.join(root, "package.json")).version !== "16.0.10") {
  throw new Error("Review the Expo SQLite vec native build before changing expo-sqlite version.");
}
const vendor = path.join(__dirname, "native", "sqlite-vec");
const destination = path.join(root, "android", "koino-vec");
fs.mkdirSync(destination, { recursive: true });
const hashes = {
  "sqlite-vec.c": "b01013b29c27981f4036286e7d1411a5bb8887fd6e1fd704023f96ddee091ab8",
  "sqlite-vec.h": "7cd70e95e6849441a98e1fbb5df550a336329d45e21981ad3aab06c7029d0906",
  "sqlite3ext.h": "b184dd1586d935133d37ad76fa353faf0a1021ff2fdedeedcc3498fff74bbb94",
  "sqlite3.h": "88da6f1963bc192dfa18a3a48b423cf1fbbb04f903202efe9a78e3a597473e18",
};
for (const file of ["sqlite-vec.c", "sqlite-vec.h", "sqlite3ext.h", "sqlite3.h"]) {
  const contents = fs.readFileSync(path.join(vendor, file));
  if (hashes[file] && crypto.createHash("sha256").update(contents).digest("hex") !== hashes[file]) {
    throw new Error(`Vendored sqlite-vec source changed unexpectedly: ${file}`);
  }
  fs.writeFileSync(path.join(destination, file), contents);
}

function patch(file, before, after) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`SQLite vec native build patch no longer matches ${file}`);
  fs.writeFileSync(file, source.replace(before, after));
}

const gradle = path.join(root, "android", "build.gradle");
patch(
  gradle,
  '"-DUSE_LIBSQL=${project.ext.USE_LIBSQL}"',
  '"-DUSE_LIBSQL=${project.ext.USE_LIBSQL}",\n          "-DWITH_SQLITE_VEC=${project.ext.WITH_SQLITE_VEC}"',
);
patch(
  gradle,
  "jniLibs.srcDirs += ['vec']",
  "// Koino: vec.so is built from pinned source by CMake, with 16 KB page alignment.",
);

const cmake = path.join(root, "android", "CMakeLists.txt");
const marker = "# Koino: build sqlite-vec from pinned source for every configured Android ABI.";
const originalCmake = fs.readFileSync(cmake, "utf8");
const nativeBuild = `${marker}
if(WITH_SQLITE_VEC)
  add_library(koino_sqlite_vec SHARED "\${CMAKE_SOURCE_DIR}/koino-vec/sqlite-vec.c")
  # Expo renames its SQLite types to exsqlite3_*. Standalone extensions need the
  # original SQLite headers and use the ABI-compatible sqlite3_api vtable.
  target_include_directories(koino_sqlite_vec PRIVATE "\${CMAKE_SOURCE_DIR}/koino-vec")
  target_compile_options(koino_sqlite_vec PRIVATE -O3)
  set_target_properties(koino_sqlite_vec PROPERTIES OUTPUT_NAME "vec" PREFIX "")
  # Use LINK_FLAGS to retain compatibility with this package's CMake minimum.
  set_property(TARGET koino_sqlite_vec APPEND_STRING PROPERTY LINK_FLAGS " -Wl,-z,max-page-size=16384")
  target_link_libraries(koino_sqlite_vec m)
endif()
`;
const markerIndex = originalCmake.indexOf(marker);
const patchedCmake = markerIndex < 0
  ? `${originalCmake}\n${nativeBuild}`
  : `${originalCmake.slice(0, markerIndex)}${nativeBuild}`;
if (patchedCmake !== originalCmake) fs.writeFileSync(cmake, patchedCmake);
