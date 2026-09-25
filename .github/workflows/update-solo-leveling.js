const admin = require('firebase-admin');

const DB_URL = process.env.FIREBASE_DB_URL;
const SA_RAW = process.env.FIREBASE_SA;

const NEW_URLS = [
  'https://voe.sx/e/nakuacv3tp75',
  'https://voe.sx/e/ajye0tcuuo56',
  'https://voe.sx/e/wifo6ri5mc2t',
  'https://voe.sx/e/1gzlzyawaqd4',
  'https://voe.sx/e/y7dcobtbukkd',
  'https://voe.sx/e/la1gb08jjezi',
  'https://voe.sx/e/wm7bjekq7p0m',
  'https://voe.sx/e/b4vnh3hs1lji',
  'https://voe.sx/e/lg8me8uvtm4j',
  'https://voe.sx/e/gxv9m9c6ogj3',
  'https://voe.sx/e/lihowaegd2gy',
  'https://voe.sx/e/awnutoohbehz'
];

async function main() {
  if (!DB_URL || !SA_RAW) throw new Error('FIREBASE_DB_URL/FIREBASE_SA ausentes');
  const SA = JSON.parse(SA_RAW);
  if (SA.private_key && !SA.private_key.includes('\n')) SA.private_key = SA.private_key.replace(/\\n/g, '\n');

  admin.initializeApp({ credential: admin.credential.cert(SA), databaseURL: DB_URL });
  const db = admin.database();
  const ref = db.ref('animaplays/posts/solo-leveling');

  const snap = await ref.once('value');
  const post = snap.val();
  if (!post) throw new Error('Post solo-leveling não encontrado no Firebase');

  const episodes = (post.episodes || []).map((ep, i) => {
    const url = NEW_URLS[i];
    if (!url) return ep;
    const name = (ep.videos && ep.videos[0] && ep.videos[0].name) || 'Servidor 1';
    return {
      ...ep,
      video: url,
      videos: [{ name, url }]
    };
  });

  const updated = {
    ...post,
    episodes,
    episodeUrls: episodes.map((e) => e.video).filter(Boolean),
    defaultVideo: (episodes[0] && episodes[0].video) || post.defaultVideo,
    status: 'pending',
    updatedAt: new Date().toISOString()
  };

  await ref.set(updated);
  console.log('OK: solo-leveling atualizado com ' + episodes.length + ' episódios (voe.sx)');

  const titles = episodes.map((e, i) => e.title || '').filter(Boolean).length;
  console.log('Títulos preservados: ' + titles + ' de ' + episodes.length);

  await admin.app().delete();
  setTimeout(() => process.exit(0), 100);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });