const moment = require('moment-timezone');

const TIMEZONE = process.env.TIMEZONE || 'America/New_York';

const formatDate = (date, formatString = 'MMM D, YYYY') => {
  if (!date) return '';
  return moment.utc(date).tz(TIMEZONE).format(formatString);
};

const formatTime = (date, formatString = 'h:mm A') => {
  if (!date) return '';
  return moment.utc(date).tz(TIMEZONE).format(formatString);
};

const formatDateTime = (date, formatString = 'MMM D, YYYY, h:mm A') => {
  if (!date) return '';
  return moment.utc(date).tz(TIMEZONE).format(formatString);
};

const momentInTz = (date) => {
  return date ? moment.tz(date, TIMEZONE) : moment.tz(TIMEZONE);
};

const utcToTz = (utcDate) => {
  return moment.utc(utcDate).tz(TIMEZONE);
};

module.exports = {
  TIMEZONE,
  formatDate,
  formatTime,
  formatDateTime,
  momentInTz,
  utcToTz
};
