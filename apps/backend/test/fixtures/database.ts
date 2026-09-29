import { DataSource } from 'typeorm';
import { User, UserRole } from '../../src/users/user.entity';

/**
 * Deterministic seed data shared by the e2e suites.
 * Tests may rely on these records existing at the start of every test.
 */
export const SEED_USERS = {
  admin: {
    email: 'seed-admin@example.com',
    username: 'seed-admin',
    passwordHash: 'not-a-real-hash',
    role: UserRole.ADMIN,
    isEmailVerified: true,
  },
} satisfies Record<string, Partial<User>>;

/** Drops and recreates the schema so no state leaks between tests. */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.synchronize(true);
}

/** Inserts the deterministic seed records. */
export async function seedDatabase(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  await userRepo.save(Object.values(SEED_USERS).map((u) => userRepo.create(u)));
}

/** Resets then seeds; call from `beforeEach` for order-independent tests. */
export async function resetAndSeed(dataSource: DataSource): Promise<void> {
  await resetDatabase(dataSource);
  await seedDatabase(dataSource);
}
