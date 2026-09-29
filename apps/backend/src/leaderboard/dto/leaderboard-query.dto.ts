import { IsIn, IsOptional } from 'class-validator';

export const LEADERBOARD_METRICS = ['completion_rate', 'study_hours', 'courses_completed'] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export class LeaderboardQueryDto {
  @IsOptional()
  @IsIn(LEADERBOARD_METRICS)
  metric: LeaderboardMetric = 'completion_rate';
}
