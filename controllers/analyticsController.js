import * as analyticsService from '../services/analyticsService.js';

export async function getOverview(req, res) {
  try {
    const { businessId } = req.user;
    const { startDate, endDate, timezone } = req.query;

    const overview = await analyticsService.getOverviewData(businessId, {
      startDate,
      endDate,
      timezone,
    });

    return res.status(200).json(overview);
  } catch (error) {
    if (error.code === 'INVALID_DATES' || error.code === 'INVALID_TIMEZONE') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error in getOverview controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getAppointmentsOverTime(req, res) {
  try {
    const { businessId } = req.user;
    const { startDate, endDate, interval, timezone } = req.query;

    const data = await analyticsService.getAppointmentsOverTimeData(businessId, {
      startDate,
      endDate,
      interval,
      timezone,
    });

    return res.status(200).json(data);
  } catch (error) {
    if (
      error.code === 'INVALID_DATES' ||
      error.code === 'INVALID_TIMEZONE' ||
      error.code === 'INVALID_INTERVAL' ||
      error.code === 'DATE_RANGE_EXCEEDED'
    ) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error in getAppointmentsOverTime controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getTopServices(req, res) {
  try {
    const { businessId } = req.user;
    const { startDate, endDate, limit, timezone } = req.query;

    const data = await analyticsService.getTopServicesData(businessId, {
      startDate,
      endDate,
      limit,
      timezone,
    });

    return res.status(200).json(data);
  } catch (error) {
    if (
      error.code === 'INVALID_DATES' ||
      error.code === 'INVALID_TIMEZONE' ||
      error.code === 'INVALID_LIMIT'
    ) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error in getTopServices controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getEmployeeAnalytics(req, res) {
  try {
    const { businessId } = req.user;
    const { startDate, endDate, userId, timezone } = req.query;

    const data = await analyticsService.getEmployeeAnalyticsData(businessId, {
      startDate,
      endDate,
      userId,
      timezone,
    });

    return res.status(200).json(data);
  } catch (error) {
    if (
      error.code === 'INVALID_DATES' ||
      error.code === 'INVALID_TIMEZONE' ||
      error.code === 'UNAUTHORIZED_EMPLOYEE'
    ) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error in getEmployeeAnalytics controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
