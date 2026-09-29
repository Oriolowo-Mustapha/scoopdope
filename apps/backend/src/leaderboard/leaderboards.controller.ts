import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardPreferenceDto } from './dto/leaderboard-preference.dto';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';

@ApiTags('leaderboards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/leaderboards')
export class LeaderboardsController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get the anonymous daily top-100 leaderboard' })
  getLeaderboard(
    @Query() query: LeaderboardQueryDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.leaderboardService.getDailyLeaderboard(query.metric ?? 'completion_rate', user.id);
  }

  @Get('preference')
  @ApiOperation({ summary: 'Get the current leaderboard privacy preference' })
  getPreference(@CurrentUser() user: { id: string }) {
    return this.leaderboardService.getLeaderboardOptOut(user.id);
  }

  @Patch('preference')
  @ApiOperation({ summary: 'Opt in or out of anonymous leaderboards' })
  setPreference(
    @Body() preference: LeaderboardPreferenceDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.leaderboardService.setLeaderboardOptOut(user.id, preference.optOut);
  }
}
