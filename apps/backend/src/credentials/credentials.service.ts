import {
  Injectable,
  Inject,
  forwardRef,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Credential } from './credential.entity';
import { StellarService } from '../stellar/stellar.service';
import { KycService } from '../kyc/kyc.service';
import { CoursesService } from '../courses/courses.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class CredentialsService {
  constructor(
    @InjectRepository(Credential) private repo: Repository<Credential>,
    @Inject(forwardRef(() => StellarService)) private stellarService: StellarService,
    private kycService: KycService,
    private coursesService: CoursesService,
    private usersService: UsersService,
    private eventEmitter: EventEmitter2,
  ) {}

  async issue(userId: string, courseId: string, stellarPublicKey: string): Promise<Credential> {
    // Avoid duplicate credentials
    const existing = await this.repo.findOne({ where: { userId, courseId } });
    if (existing) return existing;

    // KYC gate — only enforced when the course requires it
    const course = await this.coursesService.findOne(courseId);
    if (course.requiresKyc) {
      const approved = await this.kycService.isApproved(stellarPublicKey);
      if (!approved) {
        throw new ForbiddenException(
          'KYC verification required before credential issuance for this course'
        );
      }
    }

    const metadata = {
      courseName: course.title,
      grade: 'Pass', // Could be calculated from quiz scores if available
      skills: course.skills || [],
    };

    const txHash = await this.stellarService.issueCredential(
      stellarPublicKey,
      courseId,
      metadata
    );

    // Mint reward tokens after credential issuance
    try {
      await this.stellarService.mintReward(stellarPublicKey, 100);
    } catch {
      // Non-fatal
    }

    const credential = this.repo.create({
      userId,
      courseId,
      txHash,
      stellarPublicKey,
      grade: metadata.grade,
    });
    const saved = await this.repo.save(credential);

    const user = await this.usersService.findById(userId);
    this.eventEmitter.emit('credential.issued', {
      userId,
      userEmail: user?.email ?? '',
      userName: user?.username ?? '',
      courseTitle: course.title,
      courseName: course.title,
      txHash,
    });

    return saved;
  }

  async issueBundle(userId: string, bundleId: string, stellarPublicKey: string): Promise<Credential> {
    const existing = await this.repo.findOne({ where: { userId, bundleId } });
    if (existing) return existing;

    const txHash = await this.stellarService.issueCredential(stellarPublicKey, `bundle:${bundleId}`);

    try {
      await this.stellarService.mintReward(stellarPublicKey, 500); // Higher reward for bundle completion
    } catch {
      // Non-fatal
    }

    const credential = this.repo.create({ userId, bundleId, txHash, stellarPublicKey });
    const saved = await this.repo.save(credential);

    const user = await this.usersService.findById(userId);
    this.eventEmitter.emit('credential.issued', {
      userId,
      userEmail: user?.email ?? '',
      userName: user?.username ?? '',
      courseTitle: `Bundle: ${bundleId}`,
      courseName: `Bundle: ${bundleId}`,
      txHash,
    });

    return saved;
  }

  async issueLearningPath(userId: string, learningPathId: string, stellarPublicKey: string): Promise<Credential> {
    const existing = await this.repo.findOne({ where: { userId, learningPathId } });
    if (existing) return existing;

    const txHash = await this.stellarService.issueCredential(stellarPublicKey, `learning-path:${learningPathId}`);

    try {
      await this.stellarService.mintReward(stellarPublicKey, 750);
    } catch {
      // Non-fatal
    }

    const credential = this.repo.create({ userId, learningPathId, txHash, stellarPublicKey });
    const saved = await this.repo.save(credential);

    const user = await this.usersService.findById(userId);
    this.eventEmitter.emit('credential.issued', {
      userId,
      userEmail: user?.email ?? '',
      userName: user?.username ?? '',
      courseTitle: `Learning Path: ${learningPathId}`,
      courseName: `Learning Path: ${learningPathId}`,
      txHash,
    });

    return saved;
  }

  findByUser(userId: string) {
    return this.repo.find({ where: { userId }, order: { issuedAt: 'DESC' } });
  }

  async findOne(id: string) {
    const credential = await this.repo.findOne({
      where: { id },
      relations: ['user', 'course'],
    });

    if (!credential) {
      throw new NotFoundException('Credential not found');
    }

    return credential;
  }

  async verify(txHash: string) {
    const credential = await this.repo.findOne({ where: { txHash } });
    return { credential, verified: !!credential };
  }
}
