const Notification = require('../models/Notification');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { paginate } = require('../utils/helpers');

const listNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unread } = req.query;
  const { skip, limit: lim, page: p } = paginate(req.query, { page, limit });
  const filter = { recipient: req.user.id };
  if (unread === 'true') filter.isRead = false;
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort('-createdAt').skip(skip).limit(lim).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: req.user.id, isRead: false }),
  ]);
  return sendSuccess(res, { message: 'Notifications.', data: items, meta: { page: p, limit: lim, total, pages: Math.ceil(total / lim), unreadCount } });
});

const markRead = asyncHandler(async (req, res) => {
  const n = await Notification.findOne({ _id: req.params.id, recipient: req.user.id });
  if (!n) throw new HttpError(404, 'Notification not found.');
  n.isRead = true;
  n.readAt = new Date();
  await n.save();
  return sendSuccess(res, { message: 'Notification marked as read.', data: n });
});

const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ recipient: req.user.id, isRead: false }, { isRead: true, readAt: new Date() });
  return sendSuccess(res, { message: 'All notifications marked as read.', data: null });
});

module.exports = { listNotifications, markRead, markAllRead };
