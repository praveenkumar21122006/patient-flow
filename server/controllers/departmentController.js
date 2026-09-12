const Department = require('../models/Department');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');

const listDepartments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.active === 'true') filter.isActive = true;
  const items = await Department.find(filter).sort('name').lean();
  return sendSuccess(res, { message: 'Departments.', data: items });
});

const createDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.create({ name: req.body.name, code: String(req.body.code).toUpperCase(), description: req.body.description || '', location: req.body.location || '', averageConsultMinutes: req.body.averageConsultMinutes || 15 });
  return sendSuccess(res, { statusCode: 201, message: 'Department created.', data: dept });
});

const updateDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) throw new HttpError(404, 'Department not found.');
  ['name', 'description', 'location', 'averageConsultMinutes', 'isActive'].forEach((k) => { if (req.body[k] !== undefined) dept[k] = req.body[k]; });
  await dept.save();
  return sendSuccess(res, { message: 'Department updated.', data: dept });
});

module.exports = { listDepartments, createDepartment, updateDepartment };
