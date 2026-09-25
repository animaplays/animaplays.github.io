const admin = require('firebase-admin');

const DB_URL = process.env.FIREBASE_DB_URL;
const SA_RAW = process.env.FIREBASE_SA;

// Player 1 (links voe.sx NA ORDEM CERTA dos episódios 1 ao 12)
const VOE_URLS = [
  'https://voe.sx/e/awnutoohbehz',
  'https://voe.sx/e/gxv9m9c6ogj3',
  'https://voe.sx/e/lihowaegd2gy',
  'https://voe.sx/e/lg8me8uvtm4j',
  'https://voe.sx/e/b4vnh3hs1lji',
  'https://voe.sx/e/1gzlzyawaqd4',
  'https://voe.sx/e/wifo6ri5mc2t',
  'https://voe.sx/e/wm7bjekq7p0m',
  'https://voe.sx/e/y7dcobtbukkd',
  'https://voe.sx/e/la1gb08jjezi',
  'https://voe.sx/e/nakuacv3tp75',
  'https://voe.sx/e/ajye0tcuuo56'
];

// Player 2 (second server)
const STREAMTAPE_URLS = [
  'https://streamtape.com/e/YmRMkQVb47CvglQ/Solo_Leveling_S01E01_PT-BR.mp4',
  'https://streamtape.com/e/QyVoRxY4rdu0O86/Solo_Leveling_S01E02_PT-BR.mp4',
  'https://streamtape.com/e/Lq49me4qQWCRwKj/Solo_Leveling_S01E03_PT-BR.mp4',
  'https://streamtape.com/e/jY2pLy6WXRHz3G7/Solo_Leveling_S01E04_PT-BR.mp4',
  'https://streamtape.com/e/z3axqRp8B1cozR/Solo_Leveling_S01E05_PT-BR.mp4',
  'https://streamtape.com/e/DXY3Aaoy3ytk0DM/Solo_Leveling_S01E06_PT-BR.mp4',
  'https://streamtape.com/e/4xWwjgeKxwUKllZ/Solo_Leveling_S01E07_PT-BR.mp4',
  'https://streamtape.com/e/BLQM88dxQlfyBRP/Solo_Leveling_S01E08_PT-BR.mp4',
  'https://streamtape.com/e/R6GjWky33xFdzYD/Solo_Leveling_S01E09_PT-BR.mp4',
  'https://streamtape.com/e/eYqOJwmkg9iYYlz/Solo_Leveling_S01E10_PT-BR.mp4',
  'https://streamtape.com/e/pzKrGxYKAPFlgR/Solo_Leveling_S01E11_PT-BR.mp4',
  'https://streamtape.com/e/3WbkPVa6rasdB19/Solo_Leveling_S01E12_PT-BR.mp4'
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
    // Recompõe servidores de forma determinística: 1º voe.sx, 2º streamtape (evita duplicar em re-execuções)
    const voe = VOE_URLS[i];
    const stUrl = STREAMTAPE_URLS[i];
    const videos = [];
    if (voe) videos.push({ name: 'Servidor 1', url: voe });
    if (stUrl) videos.push({ name: 'Servidor 2', url: stUrl });
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
  console.log('OK: solo-leveling atualizado — ' + episodes.length + ' eps, 2 servidores cada (voe.sx + streamtape)');

  const twoServers = episodes.filter((e) => (e.videos || []).length >= 2).length;
  console.log('Episódios com 2 servidores: ' + twoServers + ' de ' + episodes.length);

  await admin.app().delete();
  setTimeout(() => process.exit(0), 100);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });