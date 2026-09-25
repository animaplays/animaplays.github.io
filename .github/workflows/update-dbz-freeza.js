const admin = require('firebase-admin');

const DB_URL = process.env.FIREBASE_DB_URL;
const SA_RAW = process.env.FIREBASE_SA;

// Player 1 (links voe.sx NA ORDEM CERTA dos episódios 17 ao 54 — 38 links)
const VOE_URLS = [
  'https://voe.sx/e/u5dbfjcrbojs',
  'https://voe.sx/e/bdpbjqausiay',
  'https://voe.sx/e/knukdlful3qz',
  'https://voe.sx/e/tzmq14kjcro3',
  'https://voe.sx/e/r1znakorzkxi',
  'https://voe.sx/e/l3bjoruolegp',
  'https://voe.sx/e/pw7kj91flgin',
  'https://voe.sx/e/mkxsyns0mhfl',
  'https://voe.sx/e/uibahinpofyy',
  'https://voe.sx/e/cub3ssyckkty',
  'https://voe.sx/e/aczcyqo3ushx',
  'https://voe.sx/e/nlcayyrev8tk',
  'https://voe.sx/e/qqtz2jogd1rj',
  'https://voe.sx/e/kiehzczl9xas',
  'https://voe.sx/e/fgmx6zwvyxfs',
  'https://voe.sx/e/fy5peplxcloa',
  'https://voe.sx/e/twnc0pz3k2h0',
  'https://voe.sx/e/jqsycj3xjfti',
  'https://voe.sx/e/cnksqutucuau',
  'https://voe.sx/e/qu0fxczfuvzq',
  'https://voe.sx/e/noivhtgrdnmh',
  'https://voe.sx/e/zzfrlwfbzntf',
  'https://voe.sx/e/ov8ggnapuy4m',
  'https://voe.sx/e/dh01jsplrgux',
  'https://voe.sx/e/bqwrrzb0oyrl',
  'https://voe.sx/e/y0jvkhvhpm3l',
  'https://voe.sx/e/zv1rhgysfnbg',
  'https://voe.sx/e/zzq0wruxfpnm',
  'https://voe.sx/e/zcjtdooep5jh',
  'https://voe.sx/e/pzdtuchk6ar8',
  'https://voe.sx/e/mqcxmamevntv',
  'https://voe.sx/e/lpiglhchgvnq',
  'https://voe.sx/e/px6grdrbgbtj',
  'https://voe.sx/e/tsllcy4jkmbd',
  'https://voe.sx/e/3kv8svs5sgxm',
  'https://voe.sx/e/bbmbxphlqmdk',
  'https://voe.sx/e/cfj2auibukzk',
  'https://voe.sx/e/iilrx1drmp92'
];

async function main() {
  if (!DB_URL || !SA_RAW) throw new Error('FIREBASE_DB_URL/FIREBASE_SA ausentes');
  const SA = JSON.parse(SA_RAW);
  if (SA.private_key && !SA.private_key.includes('\n')) SA.private_key = SA.private_key.replace(/\\n/g, '\n');

  admin.initializeApp({ credential: admin.credential.cert(SA), databaseURL: DB_URL });
  const db = admin.database();
  const ref = db.ref('animaplays/posts/dragon-ball-z-kai-a-saga-de-freeza-episodios-17-ao-54');

  const snap = await ref.once('value');
  const post = snap.val();
  if (!post) throw new Error('Post saga de Freeza não encontrado no Firebase');

  const episodes = (post.episodes || []).map((ep, i) => {
    // Player 1 = voe.sx (ordem determinística dos 38 eps); demais servidores seguem na frente.
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
  console.log('OK: saga de Freeza atualizada — ' + episodes.length + ' eps, Player 1 = voe.sx (' + VOE_URLS.length + ' links)');

  const twoServers = episodes.filter((e) => (e.videos || []).length >= 2).length;
  console.log('Episódios com 2+ servidores: ' + twoServers + ' de ' + episodes.length);

  await admin.app().delete();
  setTimeout(() => process.exit(0), 100);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });