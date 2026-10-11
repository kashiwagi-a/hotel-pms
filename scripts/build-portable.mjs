/**
 * ポータブル版（インストール不要で動く版）を作る。Mac で実行する。
 *
 *   npm run build:portable                 Windows 版と Mac 版を両方作る
 *   npm run build:portable -- --target win-x64
 *   npm run build:portable -- --sample     客室マスタの代わりに架空のサンプルデータを入れる
 *
 * 出力：dist/hotel-pms-win-x64.zip、dist/hotel-pms-mac-arm64.zip
 *
 * 中身：Node.js 本体（公式配布をチェックサム確認して同梱）、ビルド済みのアプリ、
 *       初期データベース（この PC の prisma/dev.db から施設と客室マスタだけをコピー。
 *       予約・入金・預り金はコピーしない）、起動ファイル、説明書。
 * 開発中のサーバーと衝突しないよう、dist/.work にソースをコピーしてからビルドする。
 */
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argValue = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const TARGETS = {
  'win-x64': { node: 'win-x64', archive: 'zip', engine: /windows/, launcher: 'start-hotel-pms.bat' },
  'mac-arm64': { node: 'darwin-arm64', archive: 'tar.gz', engine: /darwin-arm64/, launcher: 'start-hotel-pms.command' },
};
const targetArg = argValue('--target', 'all');
const targets = targetArg === 'all' ? Object.keys(TARGETS) : [targetArg];
for (const t of targets) {
  if (!TARGETS[t]) {
    console.error(`--target は ${Object.keys(TARGETS).join(' / ')} / all のいずれかです。`);
    process.exit(1);
  }
}
if (process.platform !== 'darwin') {
  console.error('ポータブル版の作成は Mac で実行してください。');
  process.exit(1);
}

const NODE_VERSION = process.version;
const dist = path.join(root, 'dist');
const work = path.join(dist, '.work');
const cache = path.join(dist, '.cache');
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', npm_config_update_notifier: 'false' };

const step = (msg) => console.log(`\n■ ${msg}`);
function run(cmd, cwd, extraEnv = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...env, ...extraEnv } });
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ダウンロードに失敗しました（${res.status}）：${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/** 公式の Node.js をダウンロードし、SHASUMS256.txt と照合してから展開する */
async function getNode(target) {
  fs.mkdirSync(cache, { recursive: true });
  const name = `node-${NODE_VERSION}-${target.node}.${target.archive}`;
  const file = path.join(cache, name);
  const sums = path.join(cache, `SHASUMS256-${NODE_VERSION}.txt`);
  if (!fs.existsSync(sums)) await download(`https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`, sums);
  const expected = fs.readFileSync(sums, 'utf8').split('\n').find((l) => l.trim().endsWith(`  ${name}`))?.split(/\s+/)[0];
  if (!expected) throw new Error(`${name} のチェックサムが見つかりません。`);
  if (!fs.existsSync(file)) {
    console.log(`  ダウンロード：${name}`);
    await download(`https://nodejs.org/dist/${NODE_VERSION}/${name}`, file);
  }
  const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) {
    fs.rmSync(file);
    throw new Error(`${name} のチェックサムが一致しません。もう一度実行してください。`);
  }
  const dir = path.join(cache, `node-${NODE_VERSION}-${target.node}`);
  if (!fs.existsSync(dir)) {
    if (target.archive === 'zip') execFileSync('unzip', ['-q', file, '-d', cache]);
    else execFileSync('tar', ['-xzf', file, '-C', cache]);
  }
  return dir;
}

/** 施設と客室マスタだけを初期データベースにコピーする（予約・入金・預り金はコピーしない） */
async function copyRoomMaster(srcDb, dstDb) {
  const require = createRequire(path.join(work, 'package.json'));
  const { PrismaClient } = require('@prisma/client');
  const src = new PrismaClient({ datasourceUrl: `file:${srcDb}` });
  const dst = new PrismaClient({ datasourceUrl: `file:${dstDb}` });
  try {
    const facilities = await src.facility.findMany({ orderBy: { id: 'asc' }, include: { rooms: true } });
    for (const f of facilities) {
      const created = await dst.facility.create({ data: { name: f.name, businessDate: f.businessDate } });
      await dst.room.createMany({
        data: f.rooms.map((r) => ({
          facilityId: created.id, number: r.number, floor: r.floor, type: r.type, typeCode: r.typeCode,
          capacity: r.capacity, building: r.building, outOfOrder: r.outOfOrder,
        })),
      });
      console.log(`  施設「${f.name}」の客室 ${f.rooms.length} 室をコピーしました（予約・入金はコピーしません）`);
    }
  } finally {
    await src.$disconnect();
    await dst.$disconnect();
  }
}

function writeText(file, text, { crlf = false, bom = false, mode } = {}) {
  let s = text.replace(/\r\n/g, '\n');
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, (bom ? '﻿' : '') + s, { encoding: 'utf8', mode });
}

async function main() {
  step('ソースを作業フォルダにコピー');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root })
    .toString().split('\0').filter(Boolean);
  for (const f of files) {
    const src = path.join(root, f);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true });
    fs.copyFileSync(src, path.join(work, f));
  }
  console.log(`  ${files.length} ファイル`);

  step('パッケージの導入とビルド');
  run('npm ci --no-audit --no-fund', work);
  run('npx prisma generate', work);
  run('npx next build', work);

  step('初期データベースを作成');
  const templateDb = path.join(work, 'template.db');
  run('npx prisma migrate deploy', work, { DATABASE_URL: `file:${templateDb}` });
  const devDb = path.join(root, 'prisma', 'dev.db');
  if (args.includes('--sample') || !fs.existsSync(devDb)) {
    console.log('  架空のサンプルデータを入れます');
    run('npx prisma db seed', work, { DATABASE_URL: `file:${templateDb}` });
  } else {
    await copyRoomMaster(devDb, templateDb);
  }

  const engineDir = path.join(work, 'node_modules', '.prisma', 'client');
  const portableDir = path.join(root, 'scripts', 'portable');
  for (const name of targets) {
    const t = TARGETS[name];
    step(`${name} 版を組み立て`);
    const out = path.join(dist, `hotel-pms-${name}`);
    fs.rmSync(out, { recursive: true, force: true });
    fs.rmSync(`${out}.zip`, { force: true });

    const app = path.join(out, 'app');
    fs.cpSync(path.join(work, '.next', 'standalone'), app, { recursive: true });
    fs.cpSync(path.join(work, '.next', 'static'), path.join(app, '.next', 'static'), { recursive: true });
    if (fs.existsSync(path.join(work, 'public'))) fs.cpSync(path.join(work, 'public'), path.join(app, 'public'), { recursive: true });
    for (const f of ['.env', 'template.db']) fs.rmSync(path.join(app, f), { force: true });

    // Prisma のエンジンは対象 OS の分だけ入れる
    const appEngineDir = path.join(app, 'node_modules', '.prisma', 'client');
    fs.rmSync(appEngineDir, { recursive: true, force: true });
    fs.cpSync(engineDir, appEngineDir, { recursive: true });
    for (const f of fs.readdirSync(appEngineDir)) {
      if (/query_engine/.test(f) && !t.engine.test(f)) fs.rmSync(path.join(appEngineDir, f));
    }
    if (!fs.readdirSync(appEngineDir).some((f) => t.engine.test(f))) throw new Error(`${name} 用の Prisma エンジンがありません。`);

    const nodeDir = await getNode(t);
    if (name === 'win-x64') {
      fs.mkdirSync(path.join(out, 'runtime'), { recursive: true });
      fs.copyFileSync(path.join(nodeDir, 'node.exe'), path.join(out, 'runtime', 'node.exe'));
    } else {
      fs.mkdirSync(path.join(out, 'runtime', 'bin'), { recursive: true });
      fs.copyFileSync(path.join(nodeDir, 'bin', 'node'), path.join(out, 'runtime', 'bin', 'node'));
      fs.chmodSync(path.join(out, 'runtime', 'bin', 'node'), 0o755);
    }

    fs.copyFileSync(templateDb, path.join(out, 'template.db'));
    const launcher = fs.readFileSync(path.join(portableDir, t.launcher), 'utf8');
    if (name === 'win-x64') writeText(path.join(out, t.launcher), launcher, { crlf: true });
    else writeText(path.join(out, t.launcher), launcher, { mode: 0o755 });
    writeText(path.join(out, 'README.txt'), fs.readFileSync(path.join(portableDir, 'README.txt'), 'utf8').replace(/^﻿/, ''), { crlf: name === 'win-x64', bom: name === 'win-x64' });

    // Mac 専用の付属ファイル（._ で始まるファイル）を入れない
    execFileSync('ditto', ['-c', '-k', '--norsrc', '--noextattr', '--noqtn', '--noacl', '--keepParent', out, `${out}.zip`]);
    const mb = (fs.statSync(`${out}.zip`).size / 1024 / 1024).toFixed(0);
    console.log(`  作成しました：dist/hotel-pms-${name}.zip（${mb}MB）`);
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log('\n完了しました。zip を別の PC にコピーして展開し、起動ファイルをダブルクリックしてください。');
}

main().catch((e) => {
  console.error(`\nエラー：${e.message}`);
  process.exitCode = 1;
});
