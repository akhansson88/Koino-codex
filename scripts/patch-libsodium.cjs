// CMake parses backslashes in Windows paths as escape sequences.
const fs = require('node:fs');
const path = 'node_modules/react-native-libsodium/android/build.gradle';
const original = fs.readFileSync(path, 'utf8');
const needle = '"-DNODE_MODULES_DIR=${nodeModules}"';
const replacement = '"-DNODE_MODULES_DIR=${nodeModules.toString().replace(\'\\\\\', \'/\')}"';
if (!original.includes(needle) && !original.includes(replacement)) {
  throw new Error('libsodium Android configuration changed; review the Windows path patch.');
}
fs.writeFileSync(path, original.replace(needle, replacement));
