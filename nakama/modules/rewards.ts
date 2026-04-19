// Rewards Module for Nakama
// Server-authoritative reward distribution with S2S verification and transactions

const STORAGE_BUCKET_BALANCE = "balance";
const STORAGE_BUCKET_REWARDS = "reward_history";

const NAKAMA_API_KEY = "$NAKAMA_API_KEY";

interface UserBalance {
  coins: number;
  gems: number;
  hintTokens: number;
  lastUpdated: string;
}

interface RewardTransaction {
  id: string;
  type: "coins" | "gems" | "hint_tokens";
  amount: number;
  source: string;
  timestamp: string;
  processed: boolean;
}

interface TransactionResult {
  success: boolean;
  balance?: UserBalance;
  error?: string;
  transactionId?: string;
}

function isServerToServerRequest(ctx: nkruntime.Context): boolean {
  const apiKey = ctx.header?.["Authorization"];
  if (!apiKey) {
    return false;
  }
  const token = apiKey.replace("Bearer ", "");
  return token === NAKAMA_API_KEY && NAKAMA_API_KEY !== "$NAKAMA_API_KEY";
}

function getEffectiveUserId(ctx: nkruntime.Context, payload: any): string {
  if (payload?.user_id) {
    return payload.user_id;
  }
  return ctx.userId;
}

function rpcGrantReward(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = JSON.parse(payload);
    const isS2S = isServerToServerRequest(ctx);

    if (!isS2S) {
      logger.warn(`Unauthorized reward grant attempt from user ${ctx.userId}`);
      return JSON.stringify({ 
        success: false, 
        error: "This endpoint is for server-to-server communication only" 
      });
    }

    const userId = data.user_id;
    const rewardType = data.type;
    const amount = data.amount;

    if (!userId || !rewardType || !amount || amount <= 0) {
      return JSON.stringify({ success: false, error: "Invalid reward parameters" });
    }

    const result = addReward(ctx, logger, userId, rewardType, amount, data.source || "server");

    return JSON.stringify(result);
  } catch (error) {
    logger.error(`Grant reward RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function addReward(
  ctx: nkruntime.Context, 
  logger: nkruntime.Logger, 
  userId: string, 
  rewardType: string, 
  amount: number,
  source: string
): TransactionResult {
  const storageKey = `balance_${userId}`;
  let balance = getBalanceFromStorage(ctx, logger, storageKey);

  if (!balance) {
    balance = {
      coins: 0,
      gems: 0,
      hintTokens: 3,
      lastUpdated: new Date().toISOString(),
    };
  }

  switch (rewardType) {
    case "coins":
      if (amount > 1000000) {
        logger.warn(`Suspicious coin reward amount: ${amount} for user ${userId}`);
      }
      balance.coins = Math.min(balance.coins + amount, 999999999);
      break;
    case "gems":
      if (amount > 10000) {
        logger.warn(`Suspicious gem reward amount: ${amount} for user ${userId}`);
      }
      balance.gems = Math.min(balance.gems + amount, 999999999);
      break;
    case "hint_tokens":
      balance.hintTokens = Math.min(balance.hintTokens + amount, 99);
      break;
    default:
      return { success: false, error: `Unknown reward type: ${rewardType}` };
  }

  balance.lastUpdated = new Date().toISOString();
  saveBalanceToStorage(ctx, logger, storageKey, balance);

  recordReward(ctx, logger, userId, rewardType, amount, source);

  logger.info(`Reward granted: ${rewardType} x${amount} to user ${userId} from ${source}`);

  return { success: true, balance };
}

function rpcConsumeReward(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = JSON.parse(payload);
    const userId = getEffectiveUserId(ctx, data);
    const rewardType = data.type;
    const amount = data.amount;

    if (!rewardType || !amount || amount <= 0) {
      return JSON.stringify({ success: false, error: "Invalid consume parameters" });
    }

    const result = deductReward(ctx, logger, userId, rewardType, amount);

    return JSON.stringify(result);
  } catch (error) {
    logger.error(`Consume reward RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function deductReward(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  userId: string,
  rewardType: string,
  amount: number
): TransactionResult {
  const storageKey = `balance_${userId}`;
  let balance = getBalanceFromStorage(ctx, logger, storageKey);

  if (!balance) {
    return { success: false, error: "User balance not found" };
  }

  let currentAmount: number;
  switch (rewardType) {
    case "coins":
      currentAmount = balance.coins;
      break;
    case "gems":
      currentAmount = balance.gems;
      break;
    case "hint_tokens":
      currentAmount = balance.hintTokens;
      break;
    default:
      return { success: false, error: `Unknown reward type: ${rewardType}` };
  }

  if (currentAmount < amount) {
    return { 
      success: false, 
      error: `Insufficient ${rewardType}. Have: ${currentAmount}, Need: ${amount}` 
    };
  }

  const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    switch (rewardType) {
      case "coins":
        balance.coins -= amount;
        break;
      case "gems":
        balance.gems -= amount;
        break;
      case "hint_tokens":
        balance.hintTokens -= amount;
        break;
    }

    balance.lastUpdated = new Date().toISOString();
    saveBalanceToStorage(ctx, logger, storageKey, balance);

    recordReward(ctx, logger, userId, rewardType, -amount, `consume:${transactionId}`);

    logger.info(`Reward consumed: ${rewardType} x${amount} by user ${userId}, tx: ${transactionId}`);

    return { success: true, balance, transactionId };
  } catch (error) {
    logger.error(`Transaction failed for user ${userId}: ${error}`);
    return { success: false, error: "Transaction failed. Please try again." };
  }
}

function rpcGetBalance(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = payload ? JSON.parse(payload) : {};
    const userId = getEffectiveUserId(ctx, data);
    const storageKey = `balance_${userId}`;
    const balance = getBalanceFromStorage(ctx, logger, storageKey);

    if (balance) {
      return JSON.stringify({
        success: true,
        balance: balance,
      });
    }

    return JSON.stringify({
      success: true,
      balance: {
        coins: 0,
        gems: 0,
        hintTokens: 3,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`Get balance RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function rpcUseHintToken(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = payload ? JSON.parse(payload) : {};
    const userId = ctx.userId;
    const storageKey = `balance_${userId}`;
    let balance = getBalanceFromStorage(ctx, logger, storageKey);

    if (!balance) {
      balance = { coins: 0, gems: 0, hintTokens: 3, lastUpdated: new Date().toISOString() };
    }

    if (balance.hintTokens <= 0) {
      return JSON.stringify({ success: false, error: "No hint tokens available" });
    }

    balance.hintTokens -= 1;
    balance.lastUpdated = new Date().toISOString();
    saveBalanceToStorage(ctx, logger, storageKey, balance);

    recordReward(ctx, logger, userId, "hint_tokens", -1, "hint_use");

    logger.info(`Hint token used by user ${userId}. Remaining: ${balance.hintTokens}`);

    return JSON.stringify({
      success: true,
      balance: balance,
    });
  } catch (error) {
    logger.error(`Use hint token RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function rpcPurchaseItem(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = JSON.parse(payload);
    const userId = ctx.userId;
    const itemId = data.itemId;
    const price = data.price || 0;
    const currency = data.currency || "gems";

    if (!itemId) {
      return JSON.stringify({ success: false, error: "Missing itemId" });
    }

    const shopItems: Record<string, { price: number; currency: string; rewardType: string; rewardAmount: number }> = {
      "hint_pack_small": { price: 50, currency: "gems", rewardType: "hint_tokens", rewardAmount: 3 },
      "hint_pack_large": { price: 150, currency: "gems", rewardType: "hint_tokens", rewardAmount: 10 },
      "starter_pack": { price: 100, currency: "gems", rewardType: "coins", rewardAmount: 1000 },
      "premium_pack": { price: 500, currency: "gems", rewardType: "coins", rewardAmount: 6000 },
    };

    const item = shopItems[itemId];
    if (!item) {
      return JSON.stringify({ success: false, error: "Unknown item" });
    }

    const deductResult = deductReward(ctx, logger, userId, item.currency, item.price);
    if (!deductResult.success) {
      return JSON.stringify(deductResult);
    }

    const grantResult = addReward(ctx, logger, userId, item.rewardType, item.rewardAmount, `shop:${itemId}`);
    if (!grantResult.success) {
      logger.error(`Failed to grant shop item ${itemId} to user ${userId}, refunding`);
      addReward(ctx, logger, userId, item.currency, item.price, `shop_refund:${itemId}`);
      return JSON.stringify({ success: false, error: "Purchase failed, refund issued" });
    }

    logger.info(`User ${userId} purchased ${itemId}`);

    return JSON.stringify({
      success: true,
      balance: grantResult.balance,
      purchased: itemId,
    });
  } catch (error) {
    logger.error(`Purchase RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function getBalanceFromStorage(ctx: nkruntime.Context, logger: nkruntime.Logger, key: string): UserBalance | null {
  try {
    const storageRead: nkruntime.StorageReadRequest = {
      collection: STORAGE_BUCKET_BALANCE,
      key: key,
      userId: ctx.userId,
    };
    const reads = storageReadObjects(ctx, [storageRead]);
    if (reads.length > 0 && reads[0].value) {
      return reads[0].value as UserBalance;
    }
  } catch (e) {
    logger.debug(`No balance found for ${key}`);
  }
  return null;
}

function saveBalanceToStorage(ctx: nkruntime.Context, logger: nkruntime.Logger, key: string, balance: UserBalance): void {
  const storageWrite: nkruntime.StorageWriteRequest = {
    collection: STORAGE_BUCKET_BALANCE,
    key: key,
    value: balance,
    permissionRead: 1,
    permissionWrite: 1,
  };
  storageWriteObjects(ctx, [storageWrite]);
}

function recordReward(ctx: nkruntime.Context, logger: nkruntime.Logger, userId: string, type: string, amount: number, source: string): void {
  try {
    const storageKey = `history_${userId}`;
    let history: RewardTransaction[] = [];

    try {
      const storageRead: nkruntime.StorageReadRequest = {
        collection: STORAGE_BUCKET_REWARDS,
        key: storageKey,
        userId: ctx.userId,
      };
      const reads = storageReadObjects(ctx, [storageRead]);
      if (reads.length > 0 && reads[0].value) {
        history = reads[0].value as RewardTransaction[];
      }
    } catch (e) {
    }

    const transaction: RewardTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: type as RewardTransaction["type"],
      amount: amount,
      source: source,
      timestamp: new Date().toISOString(),
      processed: true,
    };

    history.push(transaction);

    if (history.length > 1000) {
      history = history.slice(-500);
    }

    const storageWrite: nkruntime.StorageWriteRequest = {
      collection: STORAGE_BUCKET_REWARDS,
      key: storageKey,
      value: history,
      permissionRead: 1,
      permissionWrite: 1,
    };
    storageWriteObjects(ctx, [storageWrite]);
  } catch (e) {
    logger.error(`Failed to record reward: ${e}`);
  }
}

const InitModule: nkruntime.InitModule = function (ctx: nkruntime.Context, logger: nkruntime.Logger) {
  logger.info("Rewards module loaded with S2S verification");

  rpcRegister("grant_reward", rpcGrantReward);
  rpcRegister("consume_reward", rpcConsumeReward);
  rpcRegister("get_balance", rpcGetBalance);
  rpcRegister("use_hint_token", rpcUseHintToken);
  rpcRegister("purchase_item", rpcPurchaseItem);
}
