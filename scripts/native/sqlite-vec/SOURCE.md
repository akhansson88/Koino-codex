# sqlite-vec Android source

The C implementation and generated header are unmodified files from the
[v0.1.7-alpha.2 release amalgamation](https://github.com/asg017/sqlite-vec/releases/download/v0.1.7-alpha.2/sqlite-vec-0.1.7-alpha.2-amalgamation.zip).
This exactly matches the extension version bundled by Expo SQLite 16.0.10.
The upstream MIT and Apache 2.0 licenses are retained alongside the sources.

`sqlite3ext.h` comes from [SQLite 3.49.1](https://github.com/sqlite/sqlite/blob/version-3.49.1/src/sqlite3ext.h),
and `sqlite3.h` comes from the [official 3.49.1 amalgamation](https://www.sqlite.org/2025/sqlite-amalgamation-3490100.zip),
matching Expo's SQLCipher SQLite version. SQLite's source is in the public domain.
Standalone extensions need these original headers because Expo namespaces its
own headers to `exsqlite3_*`. The extension calls Expo through SQLite's stable
extension API vtable; it does not link a second SQLite engine.

`scripts/build-sqlite-vec.cjs` patches Expo's Android CMake build to compile this
source for every ABI selected by Gradle. It replaces the package's precompiled
4 KB-aligned Android extension with a 16 KB-aligned `vec.so`. Android builds
require the normal SDK/NDK; running npm install for iOS requires neither.
