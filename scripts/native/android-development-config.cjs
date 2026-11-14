const fs = require('node:fs');
const path = require('node:path');

const firebaseResourceNames = new Set([
  'google_app_id',
  'gcm_defaultSenderId',
  'default_web_client_id',
  'ga_trackingId',
  'firebase_database_url',
  'google_api_key',
  'google_crash_reporting_api_key',
  'google_storage_bucket',
  'project_id',
]);

function verifyDevelopmentAndroidSource(androidDirectory) {
  const appDirectory = path.join(androidDirectory, 'app');
  const gradleFile = path.join(appDirectory, 'build.gradle');
  const sourceDirectory = path.join(appDirectory, 'src');
  const sourceFiles = fs.existsSync(sourceDirectory) ? fs.readdirSync(sourceDirectory, { recursive: true }) : [];

  const gradleHasGoogleServices = fs.existsSync(gradleFile) &&
    fs.readFileSync(gradleFile, 'utf8').includes('com.google.gms.google-services');
  const hasGoogleServicesConfig = fs.existsSync(path.join(appDirectory, 'google-services.json')) ||
    sourceFiles.some(file => path.basename(file) === 'google-services.json');
  // A hand-authored resource can initialize Firebase even without the Google Services plugin.
  const hasFirebaseResources = sourceFiles.filter(file => /(?:^|[/\\])res[/\\]values[^/\\]*[/\\][^/\\]+\.xml$/i.test(file))
    .some(file => {
      const xml = fs.readFileSync(path.join(sourceDirectory, file), 'utf8');
      const names = Array.from(xml.matchAll(/\bname\s*=\s*["']([^"']+)["']/g), match => match[1]);
      return names.some(name => firebaseResourceNames.has(name));
    });
  if (gradleHasGoogleServices || hasGoogleServicesConfig || hasFirebaseResources) {
    throw new Error('Refusing Android Dev build: generated project contains native Google Services configuration. Preserve the existing files and regenerate in a clean checkout.');
  }

  const hasRemoteUpdates = sourceFiles.filter(file => path.basename(file) === 'AndroidManifest.xml')
    .some(file => {
      const manifest = fs.readFileSync(path.join(sourceDirectory, file), 'utf8');
      return Array.from(manifest.matchAll(/<meta-data\b[^>]*>/g), ([tag]) => {
        const name = tag.match(/\bandroid:name\s*=\s*["']([^"']+)["']/)?.[1];
        const value = tag.match(/\bandroid:value\s*=\s*["']([^"']+)["']/)?.[1];
        return name === 'expo.modules.updates.EXPO_UPDATE_URL' ||
          (name === 'expo.modules.updates.ENABLED' && value !== 'false');
      }).some(Boolean);
    });
  if (hasRemoteUpdates) {
    throw new Error('Refusing Android Dev build: generated project contains remote Expo Updates configuration. Preserve the existing files and regenerate in a clean checkout.');
  }
}

module.exports = { firebaseResourceNames, verifyDevelopmentAndroidSource };
