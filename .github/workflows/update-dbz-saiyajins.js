const admin = require('firebase-admin');

const DB_URL = process.env.FIREBASE_DB_URL;
const SA_RAW = process.env.FIREBASE_SA;

// Player 1 (links voe.sx NA ORDEM CERTA dos episódios 1 ao 16)
const VOE_URLS = [
  'https://voe.sx/e/awtx257l2upn',
  'https://voe.sx/e/af2nrtxluf5u',
  'https://voe.sx/e/2ipzubzrfddw',
  'https://voe.sx/e/ecumqw1mg1p2',
  'https://voe.sx/e/cskv7bgueurn',
  'https://voe.sx/e/epelhvhod1qd',
  'https://voe.sx/e/lrtgrd9aoh7a',
  'https://voe.sx/e/7i5t9adnvnzd',
  'https://voe.sx/e/ceigwe49uibt',
  'https://voe.sx/e/bbboyuqlbzdm',
  'https://voe.sx/e/njtce50hmic5',
  'https://voe.sx/e/a9kkwtx8cejd',
  'https://voe.sx/e/bd8rlk7bz9fp',
  'https://voe.sx/e/eljcjx2hzlkj',
  'https://voe.sx/e/efo0wuxmyvlv',
  'https://voe.sx/e/k1jitwmomh4x'
];

async function main() {
  if (!DB_URL || !SA_RAW) throw new Error('FIREBASE_DB_URL/FIREBASE_SA ausentes');
  const SA = JSON.parse(SA_RAW);
  if (SA.private_key && !SA.private_key.includes('\n')) SA.private_key = SA.private_key.replace(/\\n/g, '\n');

  admin.initializeApp({ credential: admin.credential.cert(SA), databaseURL: DB_URL });
  const db = admin.database();
  const ref = db.ref('animaplays/posts/dragonballz');

  const snap = await ref.once('value');
  const post = snap.val();
  if (!post) throw new Error('Post dragonballz não encontrado no Firebase');

  const episodes = (post.episodes || []).map((ep, i) => {
    // Player 1 = voe.sx (ordem determinística do 1 ao 16); demais servidores seguem na frente.
    const voe = VOE_URLS[i];
    const extras = (ep.videos && ep.videos.length ? ep.videos : (ep.video ? [{ name: 'Player 1', url: ep.video }] : []))
      .filter(v => v && v.url && v.url !== voe);
    const videos = [];
    if (voe) videos.push({ name: 'Player 1', url: voe });
    extras.forEach((v, idx) => videos.push({ name: 'Player ' + (idx + 2), url: v.url }));
    return {
      ...ep,
      video: voe || ep.video,
      videos
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
  console.log('OK: dragonballz atualizado — ' + episodes.length + ' eps, Player 1 = voe.sx (1 ao ' + VOE_URLS.length + ')');

  const twoServers = episodes.filter((e) => (e.videos || []).length >= 2).length;
  console.log('Episódios com 2+ servidores: ' + twoServers + ' de ' + episodes.length);

  await admin.app().delete();
  setTimeout(() => process.exit(0), 100);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });