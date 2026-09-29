import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Reward } from '../rewards/reward.entity';

export enum SubscriptionTier {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  PRO = 'pro',
}

export enum UserRole {
  STUDENT = 'student',
  INSTRUCTOR = 'instructor',
  ADMIN = 'admin',
}

export enum Role {
  ADMIN = 'admin',
  INSTRUCTOR = 'instructor',
  STUDENT = 'student',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  username: string;

  @Column()
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.STUDENT })
  role: UserRole;

  @Column({ type: 'enum', enum: SubscriptionTier, default: SubscriptionTier.FREE })
  subscriptionTier: SubscriptionTier;

  @Column({ nullable: true, type: 'text' })
  bio: string | null;

  @Column({ nullable: true })
  avatarUrl: string | null;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true })
  deletedAt: Date;

  @Column({ nullable: true, type: 'varchar' })
  verificationToken: string | null;

  @Column({ nullable: true, type: 'datetime' })
  verificationTokenExpiresAt: Date | null;

  @Column({ default: false })
  mfaEnabled: boolean;

  @Column({ nullable: true })
  mfaSecret: string | null;

  @Column({ type: 'simple-array', nullable: true, default: null })
  mfaBackupCodes: string[] | null;

  @Column({ unique: true, nullable: true })
  referralCode: string;

  @Column({ nullable: true, type: 'varchar' })
  referredBy: string | null;

  @Column({ default: 0 })
  currentStreak: number;

  @Column({ default: 0 })
  longestStreak: number;

  @Column({ default: false })
  leaderboardOptOut: boolean;

  @Column({ nullable: true, type: 'datetime' })
  lastActivityAt: Date | null;

  @Column({
    type: 'enum',
    enum: SubscriptionTier,
    default: SubscriptionTier.FREE,
  })
  subscriptionTier: SubscriptionTier;

  @Column({ nullable: true })
  stripeCustomerId: string;

  @Column({ nullable: true })
  stripeSubscriptionId: string;

  @Column({ nullable: true, type: 'datetime' })
  subscriptionExpiresAt: Date | null;

  @Column('simple-json', {
    nullable: true,
    default: {
      courseUpdates: true,
      liveSessions: true,
      tokenRewards: true,
      pushEnabled: false,
    },
  })
  notificationPreferences: {
    courseUpdates: boolean;
    liveSessions: boolean;
    tokenRewards: boolean;
    pushEnabled: boolean;
  };
  lastLogin: Date | null;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true, type: 'timestamp' })
  lockoutUntil: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}