const admin = require('firebase-admin');

const DB_URL = process.env.FIREBASE_DB_URL;
const SA_RAW = process.env.FIREBASE_SA;

// Player 1 (links voe.sx NA ORDEM CERTA dos episódios 55 ao 98 — 44 links)
const VOE_URLS = [
  'https://voe.sx/e/etttanvcumq1',
  'https://voe.sx/e/u1h87ibpcbsa',
  'https://voe.sx/e/2ql65nbfgrmf',
  'https://voe.sx/e/medy3j6v7zl2',
  'https://voe.sx/e/j92ex1hqhano',
  'https://voe.sx/e/1ae6lhzcsoej',
  'https://voe.sx/e/kh5tqudsgqn9',
  'https://voe.sx/e/ekfwcnokchtf',
  'https://voe.sx/e/roplg67hqxh5',
  'https://voe.sx/e/egpo2xtzipbz',
  'https://voe.sx/e/vwbabv5occ5h',
  'https://voe.sx/e/divcgme6yfjq',
  'https://voe.sx/e/r9yxoset93j2',
  'https://voe.sx/e/ntigyx35tg8f',
  'https://voe.sx/e/kknoxwrkupxm',
  'https://voe.sx/e/wqt2ceg0nuog',
  'https://voe.sx/e/4mhnq3qqvpao',
  'https://voe.sx/e/ixsz4wmevkr3',
  'https://voe.sx/e/n5ydzg8kzfpc',
  'https://voe.sx/e/sxnt17vv12im',
  'https://voe.sx/e/j7jesjvjq7o2',
  'https://voe.sx/e/mxyyicbcnusg',
  'https://voe.sx/e/uz0msp8ccwmh',
  'https://voe.sx/e/7ir9rxrtakx4',
  'https://voe.sx/e/xgpad0yarhre',
  'https://voe.sx/e/zsgahd70smkf',
  'https://voe.sx/e/6ifnpbmezun0',
  'https://voe.sx/e/1bowvdr6q1b6',
  'https://voe.sx/e/dirwrlf7a5vy',
  'https://voe.sx/e/zv46kz890hoc',
  'https://voe.sx/e/xp8jo3uk39el',
  'https://voe.sx/e/yetf9epttgqg',
  'https://voe.sx/e/rueq0xchgyxv',
  'https://voe.sx/e/xsax9bm5k7wl',
  'https://voe.sx/e/molayc3uerka',
  'https://voe.sx/e/i5pghrxwmlvb',
  'https://voe.sx/e/pabu0wgdem40',
  'https://voe.sx/e/acdljieryxyv',
  'https://voe.sx/e/vo4z6spoip44',
  'https://voe.sx/e/hfj57dbj8po7',
  'https://voe.sx/e/cyn8lddysmfb',
  'https://voe.sx/e/opho3amy8nqo',
  'https://voe.sx/e/0af3cp4mvh9h',
  'https://voe.sx/e/m0xwwlxrurwt'
];

async function main() {
  if (!DB_URL || !SA_RAW) throw new Error('FIREBASE_DB_URL/FIREBASE_SA ausentes');
  const SA = JSON.parse(SA_RAW);
  if (SA.private_key && !SA.private_key.includes('\n')) SA.private_key = SA.private_key.replace(/\\n/g, '\n');

  admin.initializeApp({ credential: admin.credential.cert(SA), databaseURL: DB_URL });
  const db = admin.database();
  const ref = db.ref('animaplays/posts/dragon-ball-z-kai-a-saga-de-cell-episodios-55-ao-98');

  const snap = await ref.once('value');
  const post = snap.val();
  if (!post) throw new Error('Post saga de Cell não encontrado no Firebase');

  const episodes = (post.episodes || []).map((ep, i) => {
    // Player 1 = voe.sx (ordem determinística dos 44 eps); demais servidores seguem na frente.
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
  console.log('OK: saga de Cell atualizada — ' + episodes.length + ' eps, Player 1 = voe.sx (' + VOE_URLS.length + ' links)');

  const twoServers = episodes.filter((e) => (e.videos || []).length >= 2).length;
  console.log('Episódios com 2+ servidores: ' + twoServers + ' de ' + episodes.length);

  await admin.app().delete();
  setTimeout(() => process.exit(0), 100);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });