import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StellarModule } from '../stellar/stellar.module';
import { User } from '../users/user.entity';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { MetricsModule } from '../metrics/metrics.module';
import { Enrollment } from '../enrollments/enrollment.entity';
import { Progress } from '../progress/progress.entity';
import { Course } from '../courses/course.entity';
import { LeaderboardsController } from './leaderboards.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Enrollment, Progress, Course]), StellarModule, MetricsModule],
  providers: [LeaderboardService],
  controllers: [LeaderboardController, LeaderboardsController],
})
export class LeaderboardModule {}
