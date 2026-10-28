import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setPrismaClientForTesting,
  parseDateRange,
  calculatePreviousPeriod,
  calculateMetricComparison,
  getOverviewData,
  getAppointmentsOverTimeData,
  getTopServicesData,
  getEmployeeAnalyticsData,
} from '../services/analyticsService.js';
import * as analyticsController from '../controllers/analyticsController.js';

describe('Analytics Unit & Integration Tests', () => {

  describe('Utility Functions', () => {
    test('parseDateRange defaults to last 30 days if omitted', () => {
      const { startDate, endDate } = parseDateRange(undefined, undefined, 'UTC');
      assert.ok(startDate instanceof Date);
      assert.ok(endDate instanceof Date);
      assert.ok(startDate < endDate);
      const diffMs = endDate.getTime() - startDate.getTime();
      // Difference is 30 days + 23 hours 59 mins 59.999s (31 days minus 1 ms)
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      assert.equal(diffDays, 30);
    });

    test('parseDateRange throws error if startDate > endDate', () => {
      assert.throws(
        () => parseDateRange('2025-02-01', '2025-01-01', 'UTC'),
        (err) => err.code === 'INVALID_DATES' && err.message.includes('startDate cannot be after endDate')
      );
    });

    test('parseDateRange throws error for malformed date', () => {
      assert.throws(
        () => parseDateRange('invalid-date', '2025-01-01', 'UTC'),
        (err) => err.code === 'INVALID_DATES'
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
  });

  describe('Overview Analytics (getOverviewData)', () => {
    test('calculates today appointments, completed, new clients, cancellation rates and previous period comparison', async () => {
      const mockPrisma = {
        appointment: {
          count: async ({ where }) => {
            // Today's appointments query
            if (where.date && where.status && where.status.in) {
              return 4;
            }
            // Completed query
            if (where.status === 'COMPLETED') {
              if (where.date.gte.toISOString().startsWith('2025-01-01')) return 20; // curr
              return 10; // prev
            }
            // Canceled vs total queries for cancellation rate
            if (where.status === 'CANCELED') {
              if (where.date.gte.toISOString().startsWith('2025-01-01')) return 2; // curr canceled
              return 5; // prev canceled
            }
            // Total appointments query
            if (where.date.gte.toISOString().startsWith('2025-01-01')) return 20; // curr total
            return 25; // prev total
          },
          groupBy: async ({ where }) => {
            return [
              { businessClientId: 'client-1', _min: { date: new Date('2025-01-10T10:00:00Z') } }, // in curr
              { businessClientId: 'client-2', _min: { date: new Date('2024-12-05T10:00:00Z') } }, // in prev
              { businessClientId: 'client-3', _min: { date: new Date('2024-10-01T10:00:00Z') } }, // before prev
            ];
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
        current: 1,
        previous: 1,
        change: 0,
        percentageChange: 0,
      });
      assert.equal(res.cancellationRate.current, 10); // 2/20 * 100
      assert.equal(res.cancellationRate.previous, 20); // 5/25 * 100
      assert.equal(res.cancellationRate.change, -10);
      assert.equal(res.cancellationRate.percentageChange, -50);
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
      assert.deepEqual(res[0], {
        serviceId: 'srv-1',
        serviceName: 'Haircut',
        bookings: 2,
        percentage: 66.67,
      });
      assert.deepEqual(res[1], {
        serviceId: 'srv-2',
        serviceName: 'Shave',
        bookings: 1,
        percentage: 33.33,
      });
    });

    test('throws INVALID_LIMIT when limit is non-positive', async () => {
      await assert.rejects(
        async () => getTopServicesData('biz-123', { limit: 0 }),
        (err) => err.code === 'INVALID_LIMIT'
      );
    });
  });

  describe('Employee Analytics (getEmployeeAnalyticsData)', () => {
    test('calculates employee assigned appointments, completed, services performed, occupied minutes and occupancy rate', async () => {
      const mockEmployees = [
        {
          id: 'emp-1',
          name: 'John Barber',
          businessId: 'biz-123',
          schedules: [
            { dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00' }, // 8 hours = 480 mins
          ],
        },
      ];

      const mockAppointments = [
        {
          id: 'app-1',
          userId: 'emp-1',
          status: 'COMPLETED',
          durationMin: 30,
          services: [
            { userId: 'emp-1', service: { durationMin: 30, cleaningTimeMin: 0 } },
          ],
        },
        {
          id: 'app-2',
          userId: 'emp-1',
          status: 'CANCELED',
          durationMin: 60,
          services: [],
        },
      ];

      const mockPrisma = {
        user: {
          findMany: async () => mockEmployees,
        },
        blockedTime: {
          findMany: async () => [
            { date: new Date('2025-01-06T00:00:00Z'), start: '12:00', end: '13:00', userId: 'emp-1' }, // 60 mins block on Monday 2025-01-06
          ],
        },
        appointment: {
          findMany: async () => mockAppointments,
        },
        appointmentService: {
          count: async () => 1,
        },
      };

      setPrismaClientForTesting(mockPrisma);

      // Single day test: Monday 2025-01-06
      const res = await getEmployeeAnalyticsData('biz-123', {
        startDate: '2025-01-06',
        endDate: '2025-01-06',
        timezone: 'UTC',
      });

      assert.equal(res.length, 1);
      const empStat = res[0];
      assert.equal(empStat.userId, 'emp-1');
      assert.equal(empStat.assignedAppointments, 2);
      assert.equal(empStat.completedAppointments, 1);
      assert.equal(empStat.canceledAppointments, 1);
      assert.equal(empStat.cancellationRate, 50);
      assert.equal(empStat.servicesPerformed, 1);
      assert.equal(empStat.occupiedMinutes, 30);
      // Scheduled 480 mins minus 60 mins blocked = 420 mins available
      assert.equal(empStat.availableWorkingMinutes, 420);
      assert.equal(empStat.occupancyRate, 7.14); // 30 / 420 * 100 = 7.1428...
    });

    test('throws UNAUTHORIZED_EMPLOYEE when requesting a userId not belonging to business', async () => {
      const mockPrisma = {
        user: {
          findMany: async () => [{ id: 'emp-1', businessId: 'biz-123', schedules: [] }],
        },
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
          return {
            json: (data) => {
              jsonResult = data;
            },
          };
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
          return {
            json: (data) => {
              jsonResult = data;
            },
          };
        },
      };

      await analyticsController.getAppointmentsOverTime(req, res);
      assert.equal(statusResult, 400);
      assert.ok(jsonResult.error);
    });

    test('getTopServices returns 400 on INVALID_LIMIT error', async () => {
      const req = { user: { businessId: 'biz-1' }, query: { limit: '-5' } };
      let statusResult = null;
      let jsonResult = null;
      const res = {
        status: (code) => {
          statusResult = code;
          return {
            json: (data) => {
              jsonResult = data;
            },
          };
        },
      };

      await analyticsController.getTopServices(req, res);
      assert.equal(statusResult, 400);
      assert.ok(jsonResult.error);
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
          return {
            json: (data) => {
              jsonResult = data;
            },
          };
        },
      };

      await analyticsController.getEmployeeAnalytics(req, res);
      assert.equal(statusResult, 400);
      assert.equal(jsonResult.error, 'Employee not found or unauthorized');
    });
  });

});
