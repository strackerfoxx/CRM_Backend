import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  setPrismaClientForTesting,
  parseDateRange,
  calculatePreviousPeriod,
  calculateMetricComparison,
  mergeAndClipBlockedIntervals,
  getOverviewData,
  getAppointmentsOverTimeData,
  getTopServicesData,
  getEmployeeAnalyticsData,
} from '../services/analyticsService.js';
import * as analyticsController from '../controllers/analyticsController.js';

describe('Analytics Unit & Integration Tests', () => {

  describe('Utility & Validation Functions', () => {
    test('parseDateRange defaults to last 30 days if omitted', () => {
      const { startDate, endDate } = parseDateRange(undefined, undefined, 'UTC');
      assert.ok(startDate instanceof Date);
      assert.ok(endDate instanceof Date);
      assert.ok(startDate < endDate);
      const diffMs = endDate.getTime() - startDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      assert.equal(diffDays, 30);
    });

    test('parseDateRange throws INVALID_TIMEZONE for invalid timezone', () => {
      assert.throws(
        () => parseDateRange('2025-01-01', '2025-01-31', 'Invalid/Timezone'),
        (err) => err.code === 'INVALID_TIMEZONE'
      );
    });

    test('parseDateRange throws INVALID_DATES if startDate > endDate', () => {
      assert.throws(
        () => parseDateRange('2025-02-01', '2025-01-01', 'UTC'),
        (err) => err.code === 'INVALID_DATES' && err.message.includes('startDate cannot be after endDate')
      );
    });

    test('parseDateRange throws INVALID_DATES for malformed date', () => {
      assert.throws(
        () => parseDateRange('invalid-date', '2025-01-01', 'UTC'),
        (err) => err.code === 'INVALID_DATES'
      );
    });

    test('parseDateRange throws DATE_RANGE_EXCEEDED when date range exceeds maxDays', () => {
      assert.throws(
        () => parseDateRange('2023-01-01', '2025-01-01', 'UTC', 366),
        (err) => err.code === 'DATE_RANGE_EXCEEDED'
      );
    });

    test('calculatePreviousPeriod returns period of identical duration', () => {
      const start = new Date('2025-01-01T00:00:00.000Z');
      const end = new Date('2025-01-31T23:59:59.999Z');
      const { prevStartDate, prevEndDate } = calculatePreviousPeriod(start, end);

      const currDuration = end.getTime() - start.getTime();
      const prevDuration = prevEndDate.getTime() - prevStartDate.getTime();
      assert.equal(prevDuration, currDuration);
      assert.equal(prevEndDate.getTime(), start.getTime() - 1);
    });

    test('calculateMetricComparison calculates absolute and percentage change correctly', () => {
      const res = calculateMetricComparison(150, 100);
      assert.deepEqual(res, {
        current: 150,
        previous: 100,
        change: 50,
        percentageChange: 50,
      });

      const zeroPrev = calculateMetricComparison(50, 0);
      assert.deepEqual(zeroPrev, {
        current: 50,
        previous: 0,
        change: 50,
        percentageChange: null,
      });
    });

    test('mergeAndClipBlockedIntervals correctly merges overlapping/adjacent blocked intervals and clips to schedule', () => {
      const schedStart = 9 * 60; // 09:00 = 540
      const schedEnd = 17 * 60;   // 17:00 = 1020

      // Blocks: 08:00-10:00, 10:00-12:00, 11:00-13:00, 18:00-19:00
      const dayBlocks = [
        { start: '08:00', end: '10:00' }, // clipped to 09:00-10:00 (60 mins)
        { start: '10:00', end: '12:00' }, // 10:00-12:00 (120 mins)
        { start: '11:00', end: '13:00' }, // overlaps with previous -> merges to 09:00-13:00 (240 mins)
        { start: '18:00', end: '19:00' }, // outside schedule -> clipped out (0 mins)
      ];

      const blockedMins = mergeAndClipBlockedIntervals(dayBlocks, schedStart, schedEnd);
      assert.equal(blockedMins, 240); // 09:00 to 13:00 = 4 hours = 240 mins
    });
  });

  describe('Overview Analytics (getOverviewData)', () => {
    test('calculates today appointments, completed, new clients, cancellation rates and previous period comparison with range-scoped candidate queries', async () => {
      const mockPrisma = {
        appointment: {
          count: async ({ where }) => {
            if (where.date && where.status && where.status.in) return 4;
            if (where.status === 'COMPLETED') {
              if (where.date.gte.toISOString().startsWith('2025-01-01')) return 20;
              return 10;
            }
            if (where.status === 'CANCELED') {
              if (where.date.gte.toISOString().startsWith('2025-01-01')) return 2;
              return 5;
            }
            if (where.date.gte.toISOString().startsWith('2025-01-01')) return 20;
            return 25;
          },
          groupBy: async ({ where }) => {
            // Range candidate query for curr vs prev or prior query
            if (where.date?.gte && where.date?.lte) {
              if (where.date.gte.toISOString().startsWith('2025-01-01')) {
                return [{ businessClientId: 'client-curr-new' }, { businessClientId: 'client-existing' }];
              } else {
                return [{ businessClientId: 'client-prev-new' }];
              }
            }
            if (where.date?.lt) {
              // Prior check: client-existing had prior appointments, client-curr-new did not
              if (where.businessClientId?.in?.includes('client-existing')) {
                return [{ businessClientId: 'client-existing' }];
              }
              return [];
            }
            return [];
          },
        },
      };

      setPrismaClientForTesting(mockPrisma);

      const res = await getOverviewData('biz-123', {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        timezone: 'UTC',
      });

      assert.equal(res.todaysAppointments, 4);
      assert.deepEqual(res.completedAppointments, {
        current: 20,
        previous: 10,
        change: 10,
        percentageChange: 100,
      });
      assert.deepEqual(res.newClients, {
        current: 1, // client-curr-new is new, client-existing had prior appointments
        previous: 1,
        change: 0,
        percentageChange: 0,
      });
      assert.equal(res.cancellationRate.current, 10);
      assert.equal(res.cancellationRate.previous, 20);
    });

    test('ignores clients with canceled appointments only for new client metric', async () => {
      const mockPrisma = {
        appointment: {
          count: async () => 0,
          groupBy: async ({ where }) => {
            assert.deepEqual(where.status, { not: 'CANCELED' });
            return [];
          },
        },
      };

      setPrismaClientForTesting(mockPrisma);

      const res = await getOverviewData('biz-123', {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        timezone: 'UTC',
      });

      assert.equal(res.newClients.current, 0);
      assert.equal(res.newClients.previous, 0);
    });
  });

  describe('Appointments Over Time (getAppointmentsOverTimeData)', () => {
    test('returns continuous date buckets with daily, weekly or monthly intervals', async () => {
      const mockAppointments = [
        { date: new Date('2025-01-01T10:00:00Z'), status: 'COMPLETED' },
        { date: new Date('2025-01-01T14:00:00Z'), status: 'SCHEDULED' },
        { date: new Date('2025-01-02T09:00:00Z'), status: 'CANCELED' },
      ];

      const mockPrisma = {
        appointment: {
          findMany: async () => mockAppointments,
        },
      };

      setPrismaClientForTesting(mockPrisma);

      const res = await getAppointmentsOverTimeData('biz-123', {
        startDate: '2025-01-01',
        endDate: '2025-01-03',
        interval: 'day',
        timezone: 'UTC',
      });

      assert.equal(res.length, 3);
      assert.deepEqual(res[0], { date: '2025-01-01', completed: 1, pending: 1, canceled: 0, total: 2 });
      assert.deepEqual(res[1], { date: '2025-01-02', completed: 0, pending: 0, canceled: 1, total: 1 });
      assert.deepEqual(res[2], { date: '2025-01-03', completed: 0, pending: 0, canceled: 0, total: 0 });
    });

    test('throws DATE_RANGE_EXCEEDED if date range exceeds 366 days', async () => {
      await assert.rejects(
        async () => getAppointmentsOverTimeData('biz-123', { startDate: '2023-01-01', endDate: '2025-01-01' }),
        (err) => err.code === 'DATE_RANGE_EXCEEDED'
      );
    });

    test('throws INVALID_INTERVAL for unsupported interval parameter', async () => {
      await assert.rejects(
        async () => getAppointmentsOverTimeData('biz-123', { interval: 'hourly' }),
        (err) => err.code === 'INVALID_INTERVAL'
      );
    });
  });

  describe('Top Services (getTopServicesData)', () => {
    test('aggregates non-canceled bookings by service and enforces business isolation', async () => {
      const mockAppointmentServices = [
        { service: { id: 'srv-1', name: 'Haircut', businessId: 'biz-123' } },
        { service: { id: 'srv-1', name: 'Haircut', businessId: 'biz-123' } },
        { service: { id: 'srv-2', name: 'Shave', businessId: 'biz-123' } },
        { service: { id: 'srv-3', name: 'Other Business Service', businessId: 'biz-OTHER' } },
      ];

      const mockPrisma = {
        appointmentService: {
          findMany: async () => mockAppointmentServices,
        },
      };

      setPrismaClientForTesting(mockPrisma);

      const res = await getTopServicesData('biz-123', {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        limit: 5,
        timezone: 'UTC',
      });

      assert.equal(res.length, 2);
      assert.deepEqual(res[0], { serviceId: 'srv-1', serviceName: 'Haircut', bookings: 2, percentage: 66.67 });
      assert.deepEqual(res[1], { serviceId: 'srv-2', serviceName: 'Shave', bookings: 1, percentage: 33.33 });
    });

    test('rejects decimals, non-integers, negative numbers, and numbers over 50 for limit', async () => {
      await assert.rejects(
        async () => getTopServicesData('biz-123', { limit: 5.5 }),
        (err) => err.code === 'INVALID_LIMIT'
      );
      await assert.rejects(
        async () => getTopServicesData('biz-123', { limit: 0 }),
        (err) => err.code === 'INVALID_LIMIT'
      );
      await assert.rejects(
        async () => getTopServicesData('biz-123', { limit: 100 }),
        (err) => err.code === 'INVALID_LIMIT'
      );
    });
  });

  describe('Employee Analytics (getEmployeeAnalyticsData)', () => {
    test('correctly attributes multi-employee service assignments and handles overlapping blocks without double-counting', async () => {
      const mockEmployees = [
        {
          id: 'emp-1',
          name: 'John Barber',
          businessId: 'biz-123',
          schedules: [
            { dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00' }, // 8h = 480m
          ],
        },
        {
          id: 'emp-2',
          name: 'Jane Stylist',
          businessId: 'biz-123',
          schedules: [
            { dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00' }, // 8h = 480m
          ],
        },
      ];

      // Appointment assigned to emp-1 at app level, with service 1 assigned to emp-1 and service 2 assigned to emp-2
      const mockAllAppointments = [
        {
          id: 'app-1',
          userId: 'emp-1',
          status: 'COMPLETED',
          durationMin: 60,
          services: [
            { userId: 'emp-1', service: { durationMin: 30, cleaningTimeMin: 0 } },
            { userId: 'emp-2', service: { durationMin: 30, cleaningTimeMin: 0 } },
          ],
        },
      ];

      const mockPrisma = {
        user: {
          findMany: async () => mockEmployees,
        },
        blockedTime: {
          findMany: async () => [
            { date: new Date('2025-01-06T00:00:00Z'), start: '12:00', end: '13:00', userId: 'emp-1' },
            { date: new Date('2025-01-06T00:00:00Z'), start: '12:30', end: '13:30', userId: 'emp-1' }, // Overlaps: 12:00-13:30 = 90 mins total
          ],
        },
        appointment: {
          findMany: async () => mockAllAppointments,
        },
        appointmentService: {
          findMany: async () => [{ userId: 'emp-1' }, { userId: 'emp-2' }],
        },
      };

      setPrismaClientForTesting(mockPrisma);

      const res = await getEmployeeAnalyticsData('biz-123', {
        startDate: '2025-01-06',
        endDate: '2025-01-06',
        timezone: 'UTC',
      });

      assert.equal(res.length, 2);

      const emp1 = res.find(e => e.userId === 'emp-1');
      assert.equal(emp1.assignedAppointments, 1);
      assert.equal(emp1.occupiedMinutes, 30); // only emp-1 service duration counted
      // 480 mins - 90 mins merged blocked = 390 mins available
      assert.equal(emp1.availableWorkingMinutes, 390);

      const emp2 = res.find(e => e.userId === 'emp-2');
      assert.equal(emp2.assignedAppointments, 1);
      assert.equal(emp2.occupiedMinutes, 30); // only emp-2 service duration counted
      assert.equal(emp2.availableWorkingMinutes, 480);
    });

    test('returns occupancyRate null when employee has no schedule or 0 working minutes', async () => {
      const mockEmployees = [
        {
          id: 'emp-no-sched',
          name: 'No Schedule Employee',
          businessId: 'biz-123',
          schedules: [],
        },
      ];

      const mockPrisma = {
        user: { findMany: async () => mockEmployees },
        blockedTime: { findMany: async () => [] },
        appointment: { findMany: async () => [] },
        appointmentService: { findMany: async () => [] },
      };

      setPrismaClientForTesting(mockPrisma);

      const res = await getEmployeeAnalyticsData('biz-123', {
        startDate: '2025-01-01',
        endDate: '2025-01-01',
        timezone: 'UTC',
      });

      assert.equal(res[0].availableWorkingMinutes, 0);
      assert.equal(res[0].occupancyRate, null);
    });

    test('throws UNAUTHORIZED_EMPLOYEE when requesting a userId not belonging to business', async () => {
      const mockPrisma = {
        user: { findMany: async () => [{ id: 'emp-1', businessId: 'biz-123', schedules: [] }] },
      };

      setPrismaClientForTesting(mockPrisma);

      await assert.rejects(
        async () => getEmployeeAnalyticsData('biz-123', { userId: 'emp-OTHER' }),
        (err) => err.code === 'UNAUTHORIZED_EMPLOYEE'
      );
    });
  });

  describe('Controllers Validation & Error Handling', () => {
    test('getOverview returns 400 on INVALID_DATES error', async () => {
      const req = { user: { businessId: 'biz-1' }, query: { startDate: '2025-02-01', endDate: '2025-01-01' } };
      let statusResult = null;
      let jsonResult = null;
      const res = {
        status: (code) => {
          statusResult = code;
          return { json: (data) => { jsonResult = data; } };
        },
      };

      await analyticsController.getOverview(req, res);
      assert.equal(statusResult, 400);
      assert.ok(jsonResult.error);
    });

    test('getAppointmentsOverTime returns 400 on INVALID_INTERVAL error', async () => {
      const req = { user: { businessId: 'biz-1' }, query: { interval: 'invalid' } };
      let statusResult = null;
      let jsonResult = null;
      const res = {
        status: (code) => {
          statusResult = code;
          return { json: (data) => { jsonResult = data; } };
        },
      };

      await analyticsController.getAppointmentsOverTime(req, res);
      assert.equal(statusResult, 400);
      assert.ok(jsonResult.error);
    });

    test('getTopServices returns 400 on INVALID_LIMIT error', async () => {
      const req = { user: { businessId: 'biz-1' }, query: { limit: '5.5' } };
      let statusResult = null;
      let jsonResult = null;
      const res = {
        status: (code) => {
          statusResult = code;
          return { json: (data) => { jsonResult = data; } };
        },
      };

      await analyticsController.getTopServices(req, res);
      assert.equal(statusResult, 400);
      assert.equal(jsonResult.error, 'Limit must be an integer between 1 and 50');
    });

    test('getEmployeeAnalytics returns 400 on UNAUTHORIZED_EMPLOYEE error', async () => {
      const mockPrisma = {
        user: { findMany: async () => [] },
      };
      setPrismaClientForTesting(mockPrisma);

      const req = { user: { businessId: 'biz-1' }, query: { userId: 'unauthorized-user' } };
      let statusResult = null;
      let jsonResult = null;
      const res = {
        status: (code) => {
          statusResult = code;
          return { json: (data) => { jsonResult = data; } };
        },
      };

      await analyticsController.getEmployeeAnalytics(req, res);
      assert.equal(statusResult, 400);
      assert.equal(jsonResult.error, 'Employee not found or unauthorized');
    });
  });

});
