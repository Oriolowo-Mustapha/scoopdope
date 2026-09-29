import { IsBoolean } from 'class-validator';

export class LeaderboardPreferenceDto {
  @IsBoolean()
  optOut: boolean;
}
