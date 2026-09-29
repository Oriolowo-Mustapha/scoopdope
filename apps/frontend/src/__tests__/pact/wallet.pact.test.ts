import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import axios from 'axios';

const { like, eachLike, string } = MatchersV3;

const pact = new PactV3({
  consumer: 'Scoopdope-Frontend',
  provider: 'Scoopdope-Backend',
  dir: '../../pacts',
});

const PUBLIC_KEY = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

describe('Wallet API Contract Tests', () => {
  const client = axios.create({ baseURL: 'http://localhost:3000' });

  describe('GET /v1/stellar/balance/:publicKey', () => {
    it('should return balances for a valid Stellar account', async () => {
      await pact
        .addInteraction()
        .given('stellar account exists')
        .uponReceiving('a request to get stellar account balance')
        .withRequest('GET', `/v1/stellar/balance/${PUBLIC_KEY}`)
        .willRespondWith(200, {
          body: {
            publicKey: string(PUBLIC_KEY),
            balances: eachLike({
              asset_type: string('native'),
              balance: string('100.0000000'),
            }),
          },
        })
        .executeTest(async () => {
          const response = await client.get(`/v1/stellar/balance/${PUBLIC_KEY}`);
          expect(response.status).toBe(200);
          expect(Array.isArray(response.data.balances)).toBe(true);
        });
    });

    it('should return 404 for a non-existent Stellar account', async () => {
      const unknownKey = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
      await pact
        .addInteraction()
        .given('stellar account does not exist')
        .uponReceiving('a request to get balance for unknown stellar account')
        .withRequest('GET', `/v1/stellar/balance/${unknownKey}`)
        .willRespondWith(404, {
          body: like({
            statusCode: 404,
            message: 'Account not found',
          }),
        })
        .executeTest(async () => {
          try {
            await client.get(`/v1/stellar/balance/${unknownKey}`);
          } catch (error: any) {
            expect(error.response.status).toBe(404);
          }
        });
    });
  });
});
