// Upload l'AAB produit par prepare-android-release.mjs sur Google Play.
//
// Prérequis — .env.android (non versionné, cf. .env.android.example) :
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  chemin vers le JSON du compte de service
//   GOOGLE_PLAY_PACKAGE_NAME          (optionnel) défaut: fr.myrollingday.app
//   GOOGLE_PLAY_TRACK                 (optionnel) internal|alpha|beta|production (défaut: internal)
// Nécessite : npm i -D googleapis

import fs from 'fs';
import path from 'path';
import { c, ROOT, readPkg, loadEnv, title, die } from './lib/cli.mjs';

loadEnv('.env.android');

const AAB_PATH = path.join(ROOT, 'android/app/build/outputs/bundle/release/app-release.aab');
const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'fr.myrollingday.app';
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
const TRACK = process.env.GOOGLE_PLAY_TRACK || 'internal';

title('UPLOAD ANDROID');

if (!SERVICE_ACCOUNT_JSON) {
  die('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON manquant dans .env.android', [
    'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON → chemin vers le JSON du compte de service Google Cloud',
    'GOOGLE_PLAY_PACKAGE_NAME         → (optionnel) défaut: fr.myrollingday.app',
    'GOOGLE_PLAY_TRACK                → (optionnel) internal|alpha|beta|production',
    'Voir .env.android.example',
  ]);
}
if (!fs.existsSync(SERVICE_ACCOUNT_JSON)) die(`Compte de service introuvable : ${SERVICE_ACCOUNT_JSON}`);
if (!fs.existsSync(AAB_PATH)) {
  die(`AAB introuvable : ${AAB_PATH}`, ['Lance d\'abord : npm run prepare:android:release']);
}

let google;
try {
  ({ google } = await import('googleapis'));
} catch {
  die('Package "googleapis" manquant.', ['Installe-le : npm i -D googleapis']);
}

const { version, build = '1' } = readPkg();
console.log(c.green(`📦 Version ${c.yellow(version)} (versionCode ${c.yellow(build)})`));
console.log(c.gray(`   Package : ${PACKAGE_NAME}`));
console.log(c.gray(`   Track   : ${TRACK}`));
console.log(c.gray(`   AAB     : ${AAB_PATH}`));

const auth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_JSON,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});
const androidpublisher = google.androidpublisher({ version: 'v3', auth: await auth.getClient() });

console.log(c.magenta('\n📝 Création d\'un edit...'));
const { data: edit } = await androidpublisher.edits.insert({ packageName: PACKAGE_NAME });
console.log(c.gray(`   → Edit ID : ${edit.id}`));

console.log(c.magenta('⬆️  Upload de l\'AAB...'));
const { data: uploaded } = await androidpublisher.edits.bundles.upload({
  packageName: PACKAGE_NAME,
  editId: edit.id,
  media: { mimeType: 'application/octet-stream', body: fs.createReadStream(AAB_PATH) },
});
console.log(c.green(`✅ AAB uploadé (versionCode ${uploaded.versionCode})`));

console.log(c.magenta(`🎯 Assignation au track "${TRACK}"...`));
await androidpublisher.edits.tracks.update({
  packageName: PACKAGE_NAME,
  editId: edit.id,
  track: TRACK,
  requestBody: {
    track: TRACK,
    releases: [
      {
        versionCodes: [String(uploaded.versionCode)],
        status: 'completed',
        name: `${version} (${uploaded.versionCode})`,
      },
    ],
  },
});

console.log(c.magenta('💾 Validation de l\'edit...'));
await androidpublisher.edits.commit({ packageName: PACKAGE_NAME, editId: edit.id });

console.log(
  c.bold(c.green(`\n🎉 Version ${version} (${uploaded.versionCode}) publiée sur le track "${TRACK}".`))
);
