const admin = require('firebase-admin');

const DB_URL = process.env.FIREBASE_DB_URL;
const SA_RAW = process.env.FIREBASE_SA;

// Player 1 (links voe.sx NA ORDEM CERTA dos 13 episódios da 2ª temporada)
const VOE_URLS = [
  'https://voe.sx/e/dyeeka1v0qlz',
  'https://voe.sx/e/ewqfu8dm6omp',
  'https://voe.sx/e/n4khdec550lu',
  'https://voe.sx/e/jcqn78k1ogn4',
  'https://voe.sx/e/l7rvnirrmnzy',
  'https://voe.sx/e/ktzwum3co4fp',
  'https://voe.sx/e/e2kkyus3lz3k',
  'https://voe.sx/e/vm9yj7gfgmhe',
  'https://voe.sx/e/mhu5hezyav7y',
  'https://voe.sx/e/3hvqtca789ob',
  'https://voe.sx/e/sjlldtwzmzie',
  'https://voe.sx/e/rsoizops3gar',
  'https://voe.sx/e/d5pxwzluxzkw'
];

// Substitui o player 1 (archive.org) pelos voe.sx; mantém os demais servidores (streamtape etc.).
async function main() {
  if (!DB_URL || !SA_RAW) throw new Error('FIREBASE_DB_URL/FIREBASE_SA ausentes');
  const SA = JSON.parse(SA_RAW);
  if (SA.private_key && !SA.private_key.includes('\n')) SA.private_key = SA.private_key.replace(/\\n/g, '\n');

  admin.initializeApp({ credential: admin.credential.cert(SA), databaseURL: DB_URL });
  const db = admin.database();
  const ref = db.ref('animaplays/posts/solo-leveling-2-temporada');

  const snap = await ref.once('value');
  const post = snap.val();
  if (!post) throw new Error('Post solo-leveling-2-temporada não encontrado no Firebase');

  const episodes = (post.episodes || []).map((ep, i) => {
    // Player 1 = voe.sx na ordem; mantém os outros servidores NÃO-archive.org (ex: streamtape).
    const voe = VOE_URLS[i];
    const extras = (ep.videos && ep.videos.length ? ep.videos : (ep.video ? [{ name: 'Player 1', url: ep.video }] : []))
      .filter(v => v && v.url)
      .filter(v => !/archive\.org\//i.test(v.url))
      .filter(v => v.url !== voe);
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
  console.log('OK: solo-leveling-2-temporada atualizada — ' + episodes.length + ' eps, Player 1 = voe.sx (' + VOE_URLS.length + ' links)');

  const twoServers = episodes.filter((e) => (e.videos || []).length >= 2).length;
  console.log('Episódios com 2+ servidores: ' + twoServers + ' de ' + episodes.length);
  const archLeft = episodes.filter((e) => (e.videos || []).some(v => /archive\.org\//i.test(v.url))).length;
  console.log('Episódios ainda com archive.org: ' + archLeft);

  await admin.app().delete();
  setTimeout(() => process.exit(0), 100);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });