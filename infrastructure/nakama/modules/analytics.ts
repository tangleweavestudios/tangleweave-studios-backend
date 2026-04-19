// Analytics Module for Nakama
// Graceful failure implementation for reliable event tracking

const APTABASE_URL = "http://aptabase:3000/api/v1/event";
const ANALYTICS_TIMEOUT_MS = 2000;
const MAX_BATCH_SIZE = 50;
const BATCH_FLUSH_INTERVAL_MS = 5000;

interface AnalyticsEvent {
  eventName: string;
  props: Record<string, any>;
  timestamp?: string;
}

interface QueuedEvent {
  event: AnalyticsEvent;
  userId: string;
  sessionId?: string;
  retries: number;
}

const eventQueue: QueuedEvent[] = [];
let flushTimer: any = null;

const APP_ID = process.env["APP_ID"] || "APP-UNWIND-MAGIC-ATLAS";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);
}

async function sendAnalyticsEvent(
  event: AnalyticsEvent,
  userId: string,
  sessionId?: string
): Promise<void> {
  const payload = {
    eventName: event.eventName,
    platform: getPlatform(),
    appVersion: getAppVersion(),
    osVersion: getOsVersion(),
    sdkVersion: "nakama-2.0",
    props: {
      ...event.props,
      gameId: getGameId(),
    },
    clientTime: event.timestamp || new Date().toISOString(),
    userId: userId,
    sessionId: sessionId,
    isServerEvent: true,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANALYTICS_TIMEOUT_MS);

  try {
    const response = await fetch(APTABASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${APP_ID}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    
    if ((error as Error).name === "AbortError") {
      queueEvent(event, userId, sessionId);
    } else {
      queueEvent(event, userId, sessionId);
    }
    throw error;
  }
}

function queueEvent(event: AnalyticsEvent, userId: string, sessionId?: string): void {
  if (eventQueue.length >= MAX_BATCH_SIZE * 2) {
    return;
  }

  eventQueue.push({
    event,
    userId,
    sessionId,
    retries: 0,
  });

  if (!flushTimer) {
    flushTimer = setTimeout(flushEventQueue, BATCH_FLUSH_INTERVAL_MS);
  }
}

async function flushEventQueue(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventQueue.length === 0) {
    return;
  }

  const batch = eventQueue.splice(0, MAX_BATCH_SIZE);

  const payload = batch.map(q => ({
    eventName: q.event.eventName,
    platform: getPlatform(),
    appVersion: getAppVersion(),
    osVersion: getOsVersion(),
    sdkVersion: "nakama-2.0",
    props: {
      ...q.event.props,
      gameId: getGameId(),
      _queued: true,
    },
    clientTime: q.event.timestamp || new Date().toISOString(),
    userId: q.userId,
    sessionId: q.sessionId,
    isServerEvent: true,
  }));

  try {
    const response = await withTimeout(
      fetch(`${APTABASE_URL}/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${APP_ID}`,
        },
        body: JSON.stringify(payload),
      }),
      ANALYTICS_TIMEOUT_MS
    );

    if (!response.ok) {
      throw new Error(`Batch failed: HTTP ${response.status}`);
    }

    logger.info(`Analytics batch sent: ${batch.length} events`);
  } catch (error) {
    for (const q of batch) {
      if (q.retries < 3) {
        q.retries++;
        eventQueue.unshift(q);
      }
    }
    
    if (eventQueue.length > 0 && !flushTimer) {
      flushTimer = setTimeout(flushEventQueue, BATCH_FLUSH_INTERVAL_MS * 2);
    }
  }
}

function getGameId(): string {
  return "unwind_magic_atlas";
}

function getPlatform(): string {
  return "server";
}

function getAppVersion(): string {
  return "1.0.0";
}

function getOsVersion(): string {
  return "nakama-server";
}

function rpcTrackLevelCompleted(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = JSON.parse(payload);
    
    const event: AnalyticsEvent = {
      eventName: "level_completed",
      props: {
        level_id: data.levelId,
        hints_used: data.hintsUsed || 0,
        time_spent: data.timeSpent || 0,
        difficulty: data.difficulty || "normal",
        stars_earned: data.stars || 0,
        completion_type: data.completionType || "standard",
      },
    };

    withTimeout(
      sendAnalyticsEvent(event, ctx.userId, ctx.sessionId),
      ANALYTICS_TIMEOUT_MS
    ).catch(() => {});

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error(`Track level completed RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function rpcTrackHintUsed(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = JSON.parse(payload);
    
    const event: AnalyticsEvent = {
      eventName: "hint_used",
      props: {
        level_id: data.levelId,
        hint_type: data.hintType || "general",
        hint_index: data.hintIndex || 0,
        time_at_hint: data.timeAtHint || 0,
      },
    };

    withTimeout(
      sendAnalyticsEvent(event, ctx.userId, ctx.sessionId),
      ANALYTICS_TIMEOUT_MS
    ).catch(() => {});

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error(`Track hint used RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function rpcTrackSessionStart(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = payload ? JSON.parse(payload) : {};
    
    const event: AnalyticsEvent = {
      eventName: "session_start",
      props: {
        platform: data.platform || "unknown",
        app_version: data.appVersion || "unknown",
        os_version: data.osVersion || "unknown",
        session_id: ctx.sessionId,
      },
    };

    withTimeout(
      sendAnalyticsEvent(event, ctx.userId, ctx.sessionId),
      ANALYTICS_TIMEOUT_MS
    ).catch(() => {});

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error(`Track session start RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function rpcTrackPurchase(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = JSON.parse(payload);
    
    const event: AnalyticsEvent = {
      eventName: "purchase_completed",
      props: {
        product_id: data.productId,
        currency: data.currency || "gems",
        amount_paid: data.amountPaid || 0,
        gems_received: data.gemsReceived || 0,
        store: data.store || "unknown",
        transaction_id: data.transactionId,
      },
    };

    withTimeout(
      sendAnalyticsEvent(event, ctx.userId, ctx.sessionId),
      ANALYTICS_TIMEOUT_MS
    ).catch(() => {});

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error(`Track purchase RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function rpcTrackCustomEvent(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = JSON.parse(payload);
    
    if (!data.eventName) {
      return JSON.stringify({ success: false, error: "Missing eventName" });
    }

    const event: AnalyticsEvent = {
      eventName: data.eventName,
      props: data.props || {},
    };

    withTimeout(
      sendAnalyticsEvent(event, ctx.userId, ctx.sessionId),
      ANALYTICS_TIMEOUT_MS
    ).catch(() => {});

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error(`Track custom event RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function rpcTrackError(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = JSON.parse(payload);
    
    const event: AnalyticsEvent = {
      eventName: "error_occurred",
      props: {
        error_type: data.type || "unknown",
        error_message: data.message || "No message",
        stack_trace: data.stack || "No stack",
        level_id: data.levelId,
      },
    };

    withTimeout(
      sendAnalyticsEvent(event, ctx.userId, ctx.sessionId),
      ANALYTICS_TIMEOUT_MS
    ).catch(() => {});

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error(`Track error RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

const InitModule: nkruntime.InitModule = function (ctx: nkruntime.Context, logger: nkruntime.Logger) {
  logger.info("Analytics module loaded with graceful failure");

  rpcRegister("track_level_completed", rpcTrackLevelCompleted);
  rpcRegister("track_hint_used", rpcTrackHintUsed);
  rpcRegister("track_session_start", rpcTrackSessionStart);
  rpcRegister("track_purchase", rpcTrackPurchase);
  rpcRegister("track_custom_event", rpcTrackCustomEvent);
  rpcRegister("track_error", rpcTrackError);
}
