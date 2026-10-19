// ONNX Runtime 1.24.3 compatibility with Expo 54 / React Native 0.81.
// Upstream: microsoft/onnxruntime #29005, #29197 and #33081.
const fs = require("node:fs");
const path = require("node:path");
const root = path.dirname(require.resolve("onnxruntime-react-native/package.json"));
const version = require(path.join(root, "package.json")).version;
if (version !== "1.24.3") {
  throw new Error("Review the ONNX Runtime compatibility patches before changing version.");
}

// This obsolete Expo module marker hides the actual React Native native module
// from Expo autolinking. The package is a standard RN module, not an Expo module.
const obsoleteMarker = path.join(root, "unimodule.json");
if (fs.existsSync(obsoleteMarker)) {
  const marker = JSON.parse(fs.readFileSync(obsoleteMarker, "utf8"));
  if (marker.name !== "onnxruntime-react-native") {
    throw new Error("Unexpected ONNX unimodule marker; review autolinking patch.");
  }
  fs.unlinkSync(obsoleteMarker);
}

function patch(file, before, after) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`ONNX compatibility patch no longer matches ${file}`);
  fs.writeFileSync(file, source.replace(before, after));
}

const iosFile = path.join(root, "ios", "OnnxruntimeModule.mm");
patch(
  iosFile,
  '#import <React/RCTBridge+Private.h>',
  '#import <React/RCTBridge+Private.h>\n#import <React/RCTInvalidating.h>',
);
patch(
  iosFile,
  '@implementation OnnxruntimeModule',
  '@interface OnnxruntimeModule () <RCTInvalidating>\n@end\n\n@implementation OnnxruntimeModule',
);
// JSI WeakObject references must be destroyed before the runtime, not during the
// later Obj-C deallocation phase (which crashes on reload and bridge teardown).
patch(
  iosFile,
  '- (void)dealloc {\n  env.reset();\n}',
  '- (void)invalidate {\n  env.reset();\n}',
);

patch(
  path.join(root, "android", "src", "main", "java", "ai", "onnxruntime", "reactnative", "OnnxruntimeModule.java"),
  'getReactApplicationContext().getCatalystInstance().getJSCallInvokerHolder()',
  'getReactApplicationContext().getJSCallInvokerHolder()',
);

// The app is built on Windows: CMake otherwise interprets path backslashes as
// escapes (the same compatibility adjustment as react-native-libsodium).
patch(
  path.join(root, "android", "build.gradle"),
  'def nodeModules = findNodeModules(projectDir);',
  "def nodeModules = findNodeModules(projectDir).replace('\\\\', '/');",
);

// The published wrapper otherwise resolves an arbitrary newer native engine,
// while offline embeddings are built with onnxruntime-node 1.24.3.
patch(
  path.join(root, "android", "build.gradle"),
  'com.microsoft.onnxruntime:onnxruntime-android:latest.integration@aar',
  'com.microsoft.onnxruntime:onnxruntime-android:1.24.3@aar',
);
patch(
  path.join(root, "onnxruntime-react-native.podspec"),
  'spec.dependency "onnxruntime-c"',
  'spec.dependency "onnxruntime-c", "1.24.3"',
);

// NDK 27 needs an explicit flexible-page flag for the newly built JSI library.
// The upstream 1.24.3 Android AAR already contains 16 KB-compatible binaries.
patch(
  path.join(root, "android", "build.gradle"),
  'cppFlags "-O2 -frtti -fexceptions -Wall -Wno-unused-variable -fstack-protector-all"',
  'cppFlags "-O2 -frtti -fexceptions -Wall -Wno-unused-variable -fstack-protector-all"\n        arguments "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON"',
);

require("./build-sqlite-vec.cjs");
