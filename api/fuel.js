
const BASE_URL = 'https://web.fort-monitor.ru/api/integration/v1';
const LOGIN = 'Бетон04';
const PASSWORD = '3456';
const OBJECT_IDS = [86271, 120114, 95965, 65292, 95966, 95983, 133721, 120112, 120113, 72553, 118814, 86269];

// Кэш сессии (живёт в памяти Vercel-функции)
let cachedSession = null;
let sessionExpires = 0;

async function connect() {
  const res = await fetch(`${BASE_URL}/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      login: LOGIN,
      password: PASSWORD,
      timezone: 3,
    }),
  });

  if (!res.ok) throw new Error('Connect HTTP ' + res.status);

  const sid = res.headers.get('sessionid');
  if (!sid) {
    const text = await res.text();
    throw new Error('sessionid не найден. Ответ: ' + text);
  }

  cachedSession = sid;
  sessionExpires = Date.now() + 4 * 60 * 1000;
  return sid;
}

async function getSession() {
  if (cachedSession && Date.now() < sessionExpires) return cachedSession;
  return await connect();
}

function fmt(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function fetchFuel() {
  const sid = await getSession();
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 60 * 1000);

  const url = `${BASE_URL}/getobjectsfuelinfo?date_from=${encodeURIComponent(fmt(from))}&date_to=${encodeURIComponent(fmt(now))}&objects=${OBJECT_IDS.join(';')}`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'SessionId': sid },
  });

  const text = await res.text();

  if (text.includes('NoAuth') || res.status === 401 || res.status === 403) {
    cachedSession = null;
    const sid2 = await connect();
    const res2 = await fetch(url, {
      headers: { 'Accept': 'application/json', 'SessionId': sid2 },
    });
    return await res2.json();
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Bad JSON: ' + text);
  }
}

module.exports = async (req, res) => {
  try {
    const data = await fetchFuel();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
