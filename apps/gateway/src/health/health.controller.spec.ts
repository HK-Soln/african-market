import { GatewayHealthController } from './health.controller';
import { ServiceCaller } from '../common/service-caller';

describe('GatewayHealthController', () => {
  it('reports degraded when a service is down', async () => {
    const caller = {
      call: jest.fn().mockRejectedValue(new Error('down')),
    } as unknown as ServiceCaller;
    const result = await new GatewayHealthController(caller, { CURRENT_PHASE: 0 }).services();
    expect(result.status).toBe('degraded');
    expect(result.services.map((s) => s.service)).toEqual(['identity']);
  });
});
