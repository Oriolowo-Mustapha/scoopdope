/**
 * Global mocks for external services used by the backend test suites.
 *
 * Tests must never reach Stellar Horizon, Soroban RPC or a real SMTP server.
 * Registered via `setupFiles` in the Jest configs; individual specs can still
 * override any of these with their own `jest.mock(...)` call.
 *
 * Set USE_REAL_EXTERNAL_SERVICES=true to opt out (e.g. manual testnet runs).
 */
if (process.env.USE_REAL_EXTERNAL_SERVICES !== 'true') {
  jest.mock('nodemailer', () => {
    const transporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id', accepted: [], rejected: [] }),
      verify: jest.fn().mockResolvedValue(true),
      close: jest.fn(),
    };
    return {
      __esModule: true,
      createTransport: jest.fn(() => transporter),
      default: { createTransport: jest.fn(() => transporter) },
    };
  });

  jest.mock('@stellar/stellar-sdk', () => {
    const actual = jest.requireActual('@stellar/stellar-sdk');

    const callBuilder = () => {
      const builder: Record<string, jest.Mock> = {};
      for (const method of ['forAccount', 'forLedger', 'forTransaction', 'limit', 'order', 'cursor', 'join']) {
        builder[method] = jest.fn(() => builder);
      }
      builder.call = jest.fn().mockResolvedValue({ records: [], next: jest.fn(), prev: jest.fn() });
      builder.stream = jest.fn(() => jest.fn());
      return builder;
    };

    const HorizonServer = jest.fn().mockImplementation(() => ({
      loadAccount: jest.fn((publicKey: string) => Promise.resolve(new actual.Account(publicKey, '0'))),
      submitTransaction: jest
        .fn()
        .mockResolvedValue({ hash: 'mock-tx-hash', ledger: 1, successful: true }),
      fetchBaseFee: jest.fn().mockResolvedValue(Number(actual.BASE_FEE)),
      fetchTimebounds: jest.fn().mockResolvedValue({ minTime: 0, maxTime: 0 }),
      feeStats: jest.fn().mockResolvedValue({}),
      accounts: jest.fn(callBuilder),
      transactions: jest.fn(callBuilder),
      operations: jest.fn(callBuilder),
      payments: jest.fn(callBuilder),
      ledgers: jest.fn(callBuilder),
      effects: jest.fn(callBuilder),
    }));

    const RpcServer = jest.fn().mockImplementation(() => ({
      getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1 }),
      getEvents: jest.fn().mockResolvedValue({ events: [], latestLedger: 1 }),
      getAccount: jest.fn((publicKey: string) => Promise.resolve(new actual.Account(publicKey, '0'))),
      simulateTransaction: jest.fn().mockResolvedValue({}),
      sendTransaction: jest.fn().mockResolvedValue({ status: 'PENDING', hash: 'mock-tx-hash' }),
      getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
    }));

    return {
      ...actual,
      Horizon: { ...actual.Horizon, Server: HorizonServer },
      SorobanRpc: { ...actual.SorobanRpc, Server: RpcServer },
      rpc: { ...actual.rpc, Server: RpcServer },
    };
  });
}
