import { BYTES_PER_GB } from "../lib/throughput";

export const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: n < 1000 ? 2 : 0 });

export const count = (n: number) => Math.round(n).toLocaleString("en-US");

export const usd2 = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const tokensPerSecond = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 1 : 0 });

export const gb = (bytes: number) =>
  `${(bytes / BYTES_PER_GB).toLocaleString("en-US", { maximumFractionDigits: 1 })} GB`;
