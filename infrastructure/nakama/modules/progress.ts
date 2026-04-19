// Progress Module for Nakama
// Server-authoritative progress validation with anti-cheat

const STORAGE_BUCKET_PROGRESS = "progress";

interface LevelMetadata {
  minTime: number;
  maxStars: number;
  requiredLevel?: string;
  difficulty: "easy" | "normal" | "hard" | "expert";
}

const LEVEL_METADATA: Record<string, LevelMetadata> = {
  "level_1_1": { minTime: 5, maxStars: 3, difficulty: "easy" },
  "level_1_2": { minTime: 10, maxStars: 3, requiredLevel: "level_1_1", difficulty: "easy" },
  "level_1_3": { minTime: 15, maxStars: 3, requiredLevel: "level_1_2", difficulty: "easy" },
  "level_2_1": { minTime: 20, maxStars: 3, requiredLevel: "level_1_3", difficulty: "normal" },
  "level_2_2": { minTime: 25, maxStars: 3, requiredLevel: "level_2_1", difficulty: "normal" },
  "level_2_3": { minTime: 30, maxStars: 3, requiredLevel: "level_2_2", difficulty: "normal" },
  "level_3_1": { minTime: 40, maxStars: 3, requiredLevel: "level_2_3", difficulty: "hard" },
  "level_3_2": { minTime: 50, maxStars: 3, requiredLevel: "level_3_1", difficulty: "hard" },
  "level_3_3": { minTime: 60, maxStars: 3, requiredLevel: "level_3_2", difficulty: "hard" },
  "level_bonus_1": { minTime: 30, maxStars: 3, difficulty: "expert" },
  "level_bonus_2": { minTime: 45, maxStars: 3, difficulty: "expert" },
};

interface LevelProgress {
  levelId: string;
  status: "locked" | "unlocked" | "completed";
  stars: number;
  bestTime: number;
  hintsUsed: number;
  completedAt?: string;
  attempts: number;
}

interface GameProgress {
  userId: string;
  appId: string;
  currentWorld: number;
  totalStars: number;
  levels: Record<string, LevelProgress>;
  lastSyncedAt: string;
}

function getProgressKey(userId: string, appId: string): string {
  return `${userId}_${appId}`;
}

function rpcSyncProgress(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = JSON.parse(payload);
    const userId = ctx.userId;
    const appId = ctx.env?.appId || "unwind_magic_atlas";

    if (!data.levelId) {
      return JSON.stringify({ success: false, error: "Missing levelId" });
    }

    const levelId = data.levelId;
    const metadata = LEVEL_METADATA[levelId];

    if (!metadata) {
      logger.warn(`Unknown level: ${levelId}`);
      return JSON.stringify({ success: false, error: "Unknown level" });
    }

    const storageKey = getProgressKey(userId, appId);
    let existingProgress = getProgressFromStorage(ctx, logger, storageKey);

    if (!existingProgress) {
      existingProgress = {
        userId: userId,
        appId: appId,
        currentWorld: 1,
        totalStars: 0,
        levels: {},
        lastSyncedAt: new Date().toISOString(),
      };
    }

    const currentLevelProgress = existingProgress.levels[levelId];
    const now = new Date().toISOString();

    if (currentLevelProgress?.status === "completed" && data.status === "completed") {
      if (data.stars !== undefined && data.stars > currentLevelProgress.stars) {
        existingProgress.totalStars -= currentLevelProgress.stars;
        existingProgress.totalStars += Math.min(data.stars, metadata.maxStars);
        currentLevelProgress.stars = Math.min(data.stars, metadata.maxStars);
      }
      if (data.bestTime !== undefined && data.bestTime < currentLevelProgress.bestTime) {
        currentLevelProgress.bestTime = data.bestTime;
      }
      if (data.hintsUsed !== undefined) {
        currentLevelProgress.hintsUsed = Math.min(data.hintsUsed, currentLevelProgress.hintsUsed);
      }
      currentLevelProgress.attempts += 1;
      currentLevelProgress.completedAt = now;
    } else {
      if (metadata.requiredLevel) {
        const requiredProgress = existingProgress.levels[metadata.requiredLevel];
        if (!requiredProgress || requiredProgress.status !== "completed") {
          logger.warn(`User ${userId} tried to access ${levelId} without completing ${metadata.requiredLevel}`);
          return JSON.stringify({ success: false, error: "Previous level not completed" });
        }
      }

      const bestTime = data.bestTime || 0;
      if (bestTime < metadata.minTime) {
        logger.warn(`User ${userId} completed ${levelId} too fast: ${bestTime}s (min: ${metadata.minTime}s)`);
        return JSON.stringify({ 
          success: false, 
          error: "Time too short", 
          minTime: metadata.minTime 
        });
      }

      const stars = Math.min(data.stars || 1, metadata.maxStars);
      const hintsUsed = data.hintsUsed || 0;

      existingProgress.levels[levelId] = {
        levelId: levelId,
        status: data.status || "completed",
        stars: stars,
        bestTime: bestTime,
        hintsUsed: hintsUsed,
        completedAt: now,
        attempts: (currentLevelProgress?.attempts || 0) + 1,
      };

      existingProgress.totalStars = Object.values(existingProgress.levels)
        .reduce((sum, lvl) => sum + (lvl.stars || 0), 0);

      unlockNextLevels(existingProgress, levelId);
    }

    existingProgress.lastSyncedAt = now;
    saveProgressToStorage(ctx, logger, storageKey, existingProgress);

    logger.info(`Progress synced for user ${userId}, level ${levelId}, app ${appId}`);

    return JSON.stringify({
      success: true,
      progress: existingProgress,
    });
  } catch (error) {
    logger.error(`Sync progress RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function unlockNextLevels(progress: GameProgress, completedLevelId: string): void {
  const worldMatch = completedLevelId.match(/^level_(\d+)_(\d+)$/);
  if (!worldMatch) return;

  const currentWorld = parseInt(worldMatch[1]);
  const currentNum = parseInt(worldMatch[2]);

  const nextLevel = `level_${currentWorld}_${currentNum + 1}`;
  if (progress.levels[nextLevel]?.status === "locked") {
    progress.levels[nextLevel].status = "unlocked";
  }

  if (currentNum === 3) {
    const bonusLevel = `level_bonus_${currentWorld}`;
    if (!progress.levels[bonusLevel]) {
      progress.levels[bonusLevel] = {
        levelId: bonusLevel,
        status: "locked",
        stars: 0,
        bestTime: 0,
        hintsUsed: 0,
        attempts: 0,
      };
    }
    if (progress.levels[bonusLevel]?.status === "locked") {
      progress.levels[bonusLevel].status = "unlocked";
    }

    const nextWorldLevel = `level_${currentWorld + 1}_1`;
    if (!progress.levels[nextWorldLevel]) {
      progress.levels[nextWorldLevel] = {
        levelId: nextWorldLevel,
        status: "locked",
        stars: 0,
        bestTime: 0,
        hintsUsed: 0,
        attempts: 0,
      };
    }
    if (progress.levels[nextWorldLevel]?.status === "locked") {
      progress.levels[nextWorldLevel].status = "unlocked";
    }
  }
}

function getProgressFromStorage(ctx: nkruntime.Context, logger: nkruntime.Logger, key: string): GameProgress | null {
  try {
    const storageRead: nkruntime.StorageReadRequest = {
      collection: STORAGE_BUCKET_PROGRESS,
      key: key,
      userId: ctx.userId,
    };
    const reads = storageReadObjects(ctx, [storageRead]);
    if (reads.length > 0 && reads[0].value) {
      return reads[0].value as GameProgress;
    }
  } catch (e) {
    logger.debug(`No existing progress found for ${key}`);
  }
  return null;
}

function saveProgressToStorage(ctx: nkruntime.Context, logger: nkruntime.Logger, key: string, progress: GameProgress): void {
  try {
    const storageWrite: nkruntime.StorageWriteRequest = {
      collection: STORAGE_BUCKET_PROGRESS,
      key: key,
      value: progress,
      permissionRead: 1,
      permissionWrite: 1,
    };
    storageWriteObjects(ctx, [storageWrite]);
  } catch (e) {
    logger.error(`Failed to save progress: ${e}`);
    throw e;
  }
}

function rpcGetProgress(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = payload ? JSON.parse(payload) : {};
    const appId = data.appId || ctx.env?.appId || "unwind_magic_atlas";
    const storageKey = getProgressKey(ctx.userId, appId);
    const progress = getProgressFromStorage(ctx, logger, storageKey);

    if (progress) {
      return JSON.stringify({
        success: true,
        progress: progress,
      });
    }

    const defaultProgress: GameProgress = {
      userId: ctx.userId,
      appId: appId,
      currentWorld: 1,
      totalStars: 0,
      levels: {
        "level_1_1": {
          levelId: "level_1_1",
          status: "unlocked",
          stars: 0,
          bestTime: 0,
          hintsUsed: 0,
          attempts: 0,
        },
      },
      lastSyncedAt: new Date().toISOString(),
    };

    return JSON.stringify({
      success: true,
      progress: defaultProgress,
    });
  } catch (error) {
    logger.error(`Get progress RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

function rpcResetProgress(ctx: nkruntime.Context, logger: nkruntime.Logger, payload: string): string {
  try {
    const data = payload ? JSON.parse(payload) : {};
    const appId = data.appId || ctx.env?.appId || "unwind_magic_atlas";
    const storageKey = getProgressKey(ctx.userId, appId);

    const defaultProgress: GameProgress = {
      userId: ctx.userId,
      appId: appId,
      currentWorld: 1,
      totalStars: 0,
      levels: {
        "level_1_1": {
          levelId: "level_1_1",
          status: "unlocked",
          stars: 0,
          bestTime: 0,
          hintsUsed: 0,
          attempts: 0,
        },
      },
      lastSyncedAt: new Date().toISOString(),
    };

    saveProgressToStorage(ctx, logger, storageKey, defaultProgress);

    logger.info(`Progress reset for user ${ctx.userId}, app ${appId}`);

    return JSON.stringify({
      success: true,
      progress: defaultProgress,
    });
  } catch (error) {
    logger.error(`Reset progress RPC error: ${error}`);
    return JSON.stringify({ success: false, error: String(error) });
  }
}

const InitModule: nkruntime.InitModule = function (ctx: nkruntime.Context, logger: nkruntime.Logger) {
  logger.info("Progress module loaded with anti-cheat validation");

  rpcRegister("sync_progress", rpcSyncProgress);
  rpcRegister("get_progress", rpcGetProgress);
  rpcRegister("reset_progress", rpcResetProgress);
}
