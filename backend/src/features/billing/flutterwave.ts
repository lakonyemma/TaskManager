const FLW_API = "https://api.flutterwave.com/v3";

const secret = () => {
  const value = process.env.FLW_SECRET_KEY;
  if (!value) throw new Error("FLW_SECRET_KEY is not configured");
  return value;
};

const request = async (path: string, body: unknown) => {
  const response = await fetch(`${FLW_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || "Flutterwave request failed");
  return data;
};

export const createCheckout = async (params: {
  txRef: string;
  amount: number;
  currency: string;
  country: string;
  email: string;
  name: string;
  phone?: string | null;
  redirectUrl: string;
}) => {
  const data = await request("/payments", {
    tx_ref: params.txRef,
    amount: params.amount,
    currency: params.currency,
    redirect_url: params.redirectUrl,
    payment_options: params.country === "UG" ? "card,mobilemoneyuganda" : "card",
    customer: {
      email: params.email,
      name: params.name,
      ...(params.phone ? { phonenumber: params.phone } : {}),
    },
    customizations: {
      title: "Taskly Premium",
      description: "Taskly Premium monthly subscription",
    },
    meta: { product: "taskly_premium", billing_cycle: "monthly" },
  });

  if (!data?.data?.link) throw new Error("Flutterwave did not return a checkout link");
  return data.data.link as string;
};

export const verifyTransaction = async (transactionId: string) => {
  const response = await fetch(`${FLW_API}/transactions/${encodeURIComponent(transactionId)}/verify`, {
    headers: { Authorization: `Bearer ${secret()}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || "Flutterwave verification failed");
  return data?.data;
};

export const isValidWebhook = (hash?: string) => {
  const secretHash = process.env.FLW_WEBHOOK_SECRET_HASH;
  return !!secretHash && !!hash && hash === secretHash;
};
