const doctorModel = require('../models/doctorModel');
const { validateDoctor } = require('../validators/doctorValidator');
const createCrudController = require('./crudControllerFactory');

module.exports = createCrudController({
  model: doctorModel,
  validate: validateDoctor,
  label: 'Doctor',
  basePath: '/api/doctors',
});
