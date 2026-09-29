import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { StellarService } from '../stellar/stellar.service';
import { MetricsService } from '../metrics/metrics.service';
import { Enrollment } from '../enrollments/enrollment.entity';
import { Progress } from '../progress/progress.entity';
import { Course } from '../courses/course.entity';
import { LeaderboardMetric } from './dto/leaderboard-query.dto';

type LeaderboardEntry = {
  userId: string;
  username: string | null;
  email: string;
  stellarPublicKey: string;
  balance: string;
};

export type StreakLeaderboardEntry = {
  rank: number;
  userId: string;
  username: string | null;
  currentStreak: number;
  longestStreak: number;
  lastActivityAt: Date | null;
};

type MetricRow = {
  userId: string;
  completionRate: number;
  studyHours: number;
  coursesCompleted: number;
};

export type AnonymousLeaderboardEntry = {
  rank: number;
  displayName: string;
  value: number;
};

@Injectable()
export class LeaderboardService {
  private readonly cacheKey = 'leaderboard:top50';
  /** 1-minute TTL in milliseconds */
  private readonly cacheTtlMs = 60_000;
  private readonly dailyCacheTtlMs = 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(Progress)
    private readonly progressRepo: Repository<Progress>,
    private readonly stellarService: StellarService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly metricsService: MetricsService
  ) {}

  async getDailyLeaderboard(metric: LeaderboardMetric, userId: string) {
    const cacheKey = `leaderboard:daily:${this.getUtcDateKey()}:${metric}`;
    let rows = await this.cacheManager.get<MetricRow[]>(cacheKey);

    if (!rows) {
      rows = await this.calculateRankings();
      await this.cacheManager.set(cacheKey, rows, this.dailyCacheTtlMs);
    }

    const ranked = rows.map((row) => ({
      rank: 0,
      userId: row.userId,
      value: this.metricValue(row, metric),
    })).sort((left, right) => right.value - left.value || left.userId.localeCompare(right.userId))
      .map((row, index) => ({ ...row, rank: index + 1 }));
    const top = ranked.slice(0, 100);
    const current = ranked.find((row) => row.userId === userId);
    const currentUser = current && current.rank <= 100
      ? { rank: current.rank, value: current.value }
      : null;

    return {
      metric,
      rankings: top.map(({ rank, value }) => ({
        rank,
        displayName: `Student ${rank}`,
        value,
      })),
      currentUser,
      updatedAt: new Date().toISOString(),
    };
  }

  async setLeaderboardOptOut(userId: string, optOut: boolean): Promise<{ optOut: boolean }> {
    await this.userRepo.update(userId, { leaderboardOptOut: optOut });
    await Promise.all([
      this.cacheManager.del(`leaderboard:daily:${this.getUtcDateKey()}:completion_rate`),
      this.cacheManager.del(`leaderboard:daily:${this.getUtcDateKey()}:study_hours`),
      this.cacheManager.del(`leaderboard:daily:${this.getUtcDateKey()}:courses_completed`),
    ]);
    return { optOut };
  }

  async getLeaderboardOptOut(userId: string): Promise<{ optOut: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return { optOut: user?.leaderboardOptOut ?? false };
  }

  private metricValue(row: MetricRow, metric: LeaderboardMetric): number {
    if (metric === 'study_hours') return Number(row.studyHours.toFixed(2));
    if (metric === 'courses_completed') return row.coursesCompleted;
    return Number(row.completionRate.toFixed(2));
  }

  private getUtcDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async calculateRankings(): Promise<MetricRow[]> {
    const rawRows = await this.userRepo
      .createQueryBuilder('user')
      .leftJoin(Enrollment, 'enrollment', 'enrollment.userId = user.id')
      .select('user.id', 'userId')
      .addSelect('COUNT(DISTINCT enrollment.id)', 'enrolledCount')
      .addSelect('COUNT(DISTINCT CASE WHEN enrollment.completedAt IS NOT NULL THEN enrollment.id END)', 'completedCount')
      .addSelect((subQuery) => subQuery
        .select('COUNT(DISTINCT progress.courseId)')
        .from(Progress, 'progress')
        .where('progress.userId = user.id')
        .andWhere('progress.completedAt IS NOT NULL'), 'progressCompletedCount')
      .addSelect((subQuery) => subQuery
        .select('COALESCE(SUM(COALESCE(course.durationHours, 0) * COALESCE(progress.progressPct, 0) / 100.0), 0)')
        .from(Progress, 'progress')
        .innerJoin(Course, 'course', 'course.id = progress.courseId')
        .where('progress.userId = user.id'), 'studyHours')
      .where('user.deletedAt IS NULL')
      .andWhere('user.leaderboardOptOut = false')
      .groupBy('user.id')
      .getRawMany();

    return rawRows.map((row) => ({
      userId: row.userId,
      completionRate: Number(row.enrolledCount) > 0
        ? (Number(row.completedCount) / Number(row.enrolledCount)) * 100
        : 0,
      studyHours: Number(row.studyHours),
      coursesCompleted: Number(row.progressCompletedCount),
    }));
  }

  async getTopUsers() {
    const cached = await this.cacheManager.get<LeaderboardEntry[]>(this.cacheKey);
    if (cached) {
      this.metricsService.incrementCacheHit('leaderboard');
      return cached;
    }
    this.metricsService.incrementCacheMiss('leaderboard');

    const users = await this.userRepo.find({
      where: {},
      order: { createdAt: 'DESC' },
    });

    const walletUsers = users.filter((user) => Boolean(user.stellarPublicKey) && !user.deletedAt);

    const balances = await Promise.all(
      walletUsers.map(async (user) => {
        try {
          const balance = await this.stellarService.getTokenBalance(user.stellarPublicKey);
          return {
            userId: user.id,
            username: user.username ?? null,
            email: user.email,
            stellarPublicKey: user.stellarPublicKey,
            balance,
          };
        } catch {
          return {
            userId: user.id,
            username: user.username ?? null,
            email: user.email,
            stellarPublicKey: user.stellarPublicKey,
            balance: '0',
          };
        }
      })
    );

    const leaderboard = balances
      .sort((a, b) => {
        const left = BigInt(a.balance);
        const right = BigInt(b.balance);
        if (left === right) {
          return a.email.localeCompare(b.email);
        }
        return right > left ? 1 : -1;
      })
      .slice(0, 50);

    await this.cacheManager.set(this.cacheKey, leaderboard, this.cacheTtlMs);
    return leaderboard;
  }

  /**
   * Returns the top 50 users ranked by their current learning streak.
   * Ties are broken by longest-streak descending, then by most-recent
   * activity, so active learners always appear first.
   *
   * Results are cached for 60 seconds to reduce DB load.
   */
  async getStreakLeaderboard(): Promise<StreakLeaderboardEntry[]> {
    const cacheKey = 'leaderboard:streaks:top50';

    const cached = await this.cacheManager.get<StreakLeaderboardEntry[]>(cacheKey);
    if (cached) {
      this.metricsService.incrementCacheHit('leaderboard_streaks');
      return cached;
    }
    this.metricsService.incrementCacheMiss('leaderboard_streaks');

    // Fetch users with at least 1 active streak day, excluding soft-deleted accounts.
    const users = await this.userRepo
      .createQueryBuilder('user')
      .where('user.currentStreak > 0')
      .andWhere('user.deletedAt IS NULL')
      .orderBy('user.currentStreak', 'DESC')
      .addOrderBy('user.longestStreak', 'DESC')
      .addOrderBy('user.lastActivityAt', 'DESC')
      .take(50)
      .getMany();

    const leaderboard: StreakLeaderboardEntry[] = users.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      username: user.username ?? null,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      lastActivityAt: user.lastActivityAt ?? null,
    }));

    await this.cacheManager.set(cacheKey, leaderboard, this.cacheTtlMs);
    return leaderboard;
  }
}
