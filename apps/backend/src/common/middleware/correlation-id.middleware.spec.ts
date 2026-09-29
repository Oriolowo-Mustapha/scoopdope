import { CorrelationIdMiddleware, CORRELATION_ID_HEADER } from './correlation-id.middleware';
import { requestContextStorage } from '../request-context';
import { randomUUID } from 'crypto';

describe('CorrelationIdMiddleware', () => {
  it('generates an id when none is provided and exposes it as a response header', (done) => {
    const mw = new CorrelationIdMiddleware();
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };

    mw.use(req, res, () => {
      expect(req.correlationId).toBeDefined();
      expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, req.correlationId);
      // requestId is available in the AsyncLocalStorage context inside next()
      expect(requestContextStorage.getStore()?.requestId).toBe(req.correlationId);
      done();
    });
  });

  it('reuses an incoming correlation id instead of generating a new one', (done) => {
    const mw = new CorrelationIdMiddleware();
    const id = randomUUID();
    const req: any = { headers: { [CORRELATION_ID_HEADER]: id } };
    const res: any = { setHeader: jest.fn() };

    mw.use(req, res, () => {
      expect(req.correlationId).toBe(id);
      expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, id);
      expect(requestContextStorage.getStore()?.requestId).toBe(id);
      done();
    });
  });
});
