import { Client } from 'ssh2';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
const documentRoot = '/website';
const host = process.env.KOINO_SFTP_HOST || '5021379195.ssh.w2.strato.hosting';
const username = process.env.KOINO_SFTP_USER || 'su1122758';
const password = process.env.KOINO_SFTP_PASSWORD;
const expectedFingerprint = process.env.KOINO_SFTP_FINGERPRINT || 'SHA256:1gx2w8Rtv3wCgi7Jh8myf/KVd72cRQbow03UP8P095Q';

if (!password) throw new Error('KOINO_SFTP_PASSWORD is required.');

const fingerprint = (key) => `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

const client = new Client();
await new Promise((resolve, reject) => {
  client.once('ready', resolve).once('error', reject).connect({
    host,
    port: 22,
    username,
    password,
    readyTimeout: 20000,
    hostVerifier: (key) => fingerprint(key) === expectedFingerprint,
  });
});

const sftp = await new Promise((resolve, reject) => client.sftp((error, value) => error ? reject(error) : resolve(value)));
const call = (method, ...args) => new Promise((resolve, reject) => {
  sftp[method](...args, (error, value) => error ? reject(error) : resolve(value));
});
const readRemote = (remotePath) => new Promise((resolve, reject) => {
  const chunks = [];
  sftp.createReadStream(remotePath)
    .on('data', (chunk) => chunks.push(chunk))
    .on('error', reject)
    .on('end', () => resolve(Buffer.concat(chunks)));
});
const writeRemote = (remotePath, data) => new Promise((resolve, reject) => {
  sftp.createWriteStream(remotePath, { mode: 0o644 })
    .on('error', reject)
    .on('close', resolve)
    .end(data);
});

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function ensureRemoteDirectory(remoteDirectory) {
  const parts = remoteDirectory.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    try {
      await call('mkdir', current, { mode: 0o755 });
    } catch (error) {
      try {
        const details = await call('stat', current);
        if (!details.isDirectory()) throw error;
      } catch {
        throw error;
      }
    }
  }
}

const allFiles = await collectFiles(distRoot);
const files = allFiles.sort((left, right) => {
  if (left === 'index.html') return 1;
  if (right === 'index.html') return -1;
  if (left.startsWith('assets/') !== right.startsWith('assets/')) return left.startsWith('assets/') ? -1 : 1;
  return left.localeCompare(right);
});

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, '.local', 'backups', stamp);
const manifest = [];

try {
  await ensureRemoteDirectory(documentRoot);
  for (const relative of files) {
    const localPath = path.join(distRoot, ...relative.split('/'));
    const remotePath = `${documentRoot}/${relative}`;
    const localData = await readFile(localPath);
    await ensureRemoteDirectory(path.posix.dirname(remotePath));

    let previousData = null;
    try {
      const details = await call('stat', remotePath);
      if (details.isFile()) previousData = await readRemote(remotePath);
    } catch {
      // A missing target is expected for new bundles and endpoints.
    }
    if (previousData) {
      const backupPath = path.join(backupRoot, ...relative.split('/'));
      await mkdir(path.dirname(backupPath), { recursive: true });
      await writeFile(backupPath, previousData);
    }

    await writeRemote(remotePath, localData);
    const uploadedData = await readRemote(remotePath);
    if (sha256(uploadedData) !== sha256(localData)) throw new Error(`Checksum mismatch for ${relative}`);
    manifest.push({ relative, bytes: localData.length, replaced: previousData !== null, sha256: sha256(localData) });
    process.stdout.write(`Uploaded ${relative}\n`);
  }
  await mkdir(backupRoot, { recursive: true });
  await writeFile(path.join(backupRoot, 'manifest.json'), `${JSON.stringify({ host, documentRoot, files: manifest }, null, 2)}\n`);
  process.stdout.write(`Deployment complete. Backup: ${backupRoot}\n`);
} finally {
  client.end();
}
