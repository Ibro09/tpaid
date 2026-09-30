const CA = "0xa25752A9EAc4f9Fc209541b7D2A793f78E8eB991";
import dotenv from "dotenv";
dotenv.config();



async function get24hVolume(CA) {
  const apiKey =process.env.VITE_PONS_API_KEY;

  const url = `https://api.ponsapi.dev/v1/tokens/${CA}/trades?minutes=1440`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey
    }
  });

  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }

  const data = await res.json();

  const trades = Array.isArray(data)
    ? data
    : data.trades || data.data || [];

  const volumeETH = trades.reduce(
    (sum, trade) => sum + Number(trade.amountEth || 0),
    0
  );

  return {
    token: CA,
    trades: trades.length,
    volumeETH
  };
}

get24hVolume(CA)
  .then(console.log)
  .catch(console.error);