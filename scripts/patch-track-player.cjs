// RNTP 4.1.2 compatibility with React Native 0.81 / Kotlin 2.
// Keep Promise methods void for the New Architecture interop layer, and
// preserve null when a track has no original Bundle. Remove when upgrading RNTP.
const fs = require('node:fs');
const path = require('node:path');
const root = path.dirname(require.resolve('react-native-track-player/package.json'));
const version = require(path.join(root, 'package.json')).version;
if (version !== '4.1.2') throw new Error('Review the TrackPlayer compatibility patch before upgrading.');
const file = path.join(root, 'android/src/main/java/com/doublesymmetry/trackplayer/module/MusicModule.kt');
let source = fs.readFileSync(file, 'utf8');
if (!source.includes('// Koino RN 0.81 compatibility')) {
  source = source.replace(/=\s*scope\.launch \{/g, '= launch {');
  source = source.replace('    private val scope = MainScope()', `    private val scope = MainScope()
    // Koino RN 0.81 compatibility: exported Promise methods must return Unit.
    private fun launch(block: suspend kotlinx.coroutines.CoroutineScope.() -> Unit) {
        scope.launch(block = block)
    }`);
  source = source.replace('Arguments.fromBundle(musicService.tracks[index].originalItem)', 'musicService.tracks[index].originalItem?.let { Arguments.fromBundle(it) }');
  source = source.replace(/Arguments\.fromBundle\(\s*musicService\.tracks\[musicService\.getCurrentTrackIndex\(\)\]\.originalItem\s*\)/, 'musicService.tracks[musicService.getCurrentTrackIndex()].originalItem?.let { Arguments.fromBundle(it) }');
  if (/=\s*scope\.launch/.test(source)) throw new Error('Incomplete TrackPlayer patch');
  fs.writeFileSync(file, source);
}
